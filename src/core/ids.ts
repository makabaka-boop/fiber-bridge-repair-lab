/**
 * 站点编号 / 链路编号的规范化工具。
 *
 * 输入契约允许「普通 JSON 基础类型」作为编号：字符串或数字均可，
 * 内部统一转换为字符串处理。空串、布尔、null、数组、对象、NaN、
 * Infinity、非整数浮点均视为非法编号。
 */

export type Id = string;

/** 把一个 JSON 标量转换为规范编号；非法时抛出带中文说明的错误。 */
export function normalizeId(value: unknown, kind: '站点' | '链路'): Id {
  if (typeof value === 'string') {
    if (value.length === 0) {
      throw new Error(`${kind}编号不能为空字符串`);
    }
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${kind}编号不能为 NaN 或 Infinity`);
    }
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${kind}编号必须是安全整数，收到: ${String(value)}`);
    }
    return String(value);
  }
  throw new Error(
    `${kind}编号必须是非空字符串或整数，收到类型: ${value === null ? 'null' : typeof value}`,
  );
}

const encoder = new TextEncoder();
const byteCache = new Map<Id, Uint8Array>();

/** 取编号字符串的 UTF-8 字节序列（带缓存）。 */
export function utf8Bytes(id: Id): Uint8Array {
  let bytes = byteCache.get(id);
  if (!bytes) {
    bytes = encoder.encode(id);
    byteCache.set(id, bytes);
  }
  return bytes;
}

/**
 * 按 UTF-8 字节序列做无符号字典序比较。
 * 这是基线认证与所有结果列表的唯一排序口径，
 * 保证 ASCII、中文、数字混排时结论稳定，不依赖 locale。
 */
export function compareUtf8(a: Id, b: Id): number {
  const ba = utf8Bytes(a);
  const bb = utf8Bytes(b);
  const n = Math.min(ba.length, bb.length);
  for (let i = 0; i < n; i++) {
    if (ba[i] !== bb[i]) return ba[i] - bb[i];
  }
  return ba.length - bb.length;
}
