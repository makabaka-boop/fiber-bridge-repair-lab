/**
 * 导入解析与输入契约校验。
 *
 * 契约：
 *   {
 *     "sites": ["站点编号", 1001, ...],        // 2 ~ 200000 个，唯一、非空
 *     "links": [
 *       { "id": "链路编号", "source": "端点A", "target": "端点B" }, ...
 *     ]                                        // 至多 400000 条，编号唯一
 *   }
 *
 * 规则：编号为非空字符串或整数；端点必须存在于 sites；禁止自环；
 * 平行链路合法（同端点的多条链路互不影响编号唯一性）；整图必须连通。
 * 站点元素也允许写成 { "id": ... }。任何不满足均抛出中文错误，
 * 调用方负责保留上一次有效拓扑。
 */

import { DSU, type Graph } from './graph';
import { normalizeId } from './ids';

export const MAX_SITES = 200_000;
export const MIN_SITES = 2;
export const MAX_LINKS = 400_000;

export type ParseResult =
  | { ok: true; graph: Graph }
  | { ok: false; error: string };

/** 站点条目允许直接是编号，也允许是 { "id": 编号 }。 */
function siteEntryId(entry: unknown, index: number): unknown {
  if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
    if (!('id' in entry)) {
      throw new Error(`sites[${index}] 是对象但缺少 id 字段`);
    }
    return (entry as { id: unknown }).id;
  }
  return entry;
}

function parseText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`不是合法 JSON：${(e as Error).message}`);
  }
}

/** 校验并规范化拓扑文本；错误以 Result 返回，不抛出，便于 UI 直接展示。 */
export function parseTopology(text: string): ParseResult {
  try {
    const root = parseText(text);
    if (root === null || typeof root !== 'object' || Array.isArray(root)) {
      throw new Error('顶层必须是包含 sites 与 links 的 JSON 对象');
    }
    const obj = root as Record<string, unknown>;

    if (!Array.isArray(obj.sites)) throw new Error('sites 必须是数组');
    if (!Array.isArray(obj.links)) throw new Error('links 必须是数组');

    const siteList: unknown[] = obj.sites;
    const linkList: unknown[] = obj.links;

    if (siteList.length < MIN_SITES) {
      throw new Error(`至少需要 ${MIN_SITES} 个站点，当前 ${siteList.length} 个`);
    }
    if (siteList.length > MAX_SITES) {
      throw new Error(`站点数 ${siteList.length} 超过上限 ${MAX_SITES}`);
    }
    if (linkList.length > MAX_LINKS) {
      throw new Error(`链路数 ${linkList.length} 超过上限 ${MAX_LINKS}`);
    }

    // 站点：规范化 + 唯一
    const sites: string[] = new Array(siteList.length);
    const siteIndex = new Map<string, number>();
    for (let i = 0; i < siteList.length; i++) {
      const id = normalizeId(siteEntryId(siteList[i], i), '站点');
      if (siteIndex.has(id)) {
        throw new Error(`站点编号重复："${id}"`);
      }
      siteIndex.set(id, i);
      sites[i] = id;
    }

    // 链路：结构、编号唯一、端点存在、禁止自环；平行链路允许
    const edgeIds: string[] = new Array(linkList.length);
    const endpoints = new Int32Array(linkList.length * 2);
    const edgeIdSet = new Set<string>();
    const dsu = new DSU(sites.length);

    for (let i = 0; i < linkList.length; i++) {
      const raw = linkList[i];
      const where = `links[${i}]`;
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`${where} 必须是对象`);
      }
      const link = raw as Record<string, unknown>;
      if (!('id' in link)) throw new Error(`${where} 缺少 id 字段`);
      if (!('source' in link)) throw new Error(`${where} 缺少 source 字段`);
      if (!('target' in link)) throw new Error(`${where} 缺少 target 字段`);

      const id = normalizeId(link.id, '链路');
      if (edgeIdSet.has(id)) {
        throw new Error(`链路编号重复："${id}"`);
      }
      const sourceId = normalizeId(link.source, '站点');
      const targetId = normalizeId(link.target, '站点');

      const u = siteIndex.get(sourceId);
      if (u === undefined) {
        throw new Error(`${where}(id="${id}") 的端点 "${sourceId}" 不在 sites 中`);
      }
      const v = siteIndex.get(targetId);
      if (v === undefined) {
        throw new Error(`${where}(id="${id}") 的端点 "${targetId}" 不在 sites 中`);
      }
      if (u === v) {
        throw new Error(`${where}(id="${id}") 是自环链路，禁止自环`);
      }

      edgeIdSet.add(id);
      edgeIds[i] = id;
      endpoints[i * 2] = u;
      endpoints[i * 2 + 1] = v;
      dsu.union(u, v);
    }

    // 连通性：n ≥ 2 时必须所有站点在同一集合
    const root0 = dsu.find(0);
    for (let i = 1; i < sites.length; i++) {
      if (dsu.find(i) !== root0) {
        throw new Error('原图必须连通：存在与主网络不相连的站点');
      }
    }

    return { ok: true, graph: { sites, edgeIds, endpoints } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
