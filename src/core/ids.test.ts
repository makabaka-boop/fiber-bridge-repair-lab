import { describe, it, expect } from 'vitest';
import { compareUtf8, normalizeId } from './ids';

describe('normalizeId', () => {
  it('接受非空字符串与安全整数', () => {
    expect(normalizeId('abc', '站点')).toBe('abc');
    expect(normalizeId(42, '链路')).toBe('42');
    expect(normalizeId(0, '站点')).toBe('0');
    expect(normalizeId(-7, '站点')).toBe('-7');
  });

  it('拒绝空串、布尔、null、数组、对象、NaN、Infinity、浮点', () => {
    expect(() => normalizeId('', '站点')).toThrow();
    expect(() => normalizeId(true, '站点')).toThrow();
    expect(() => normalizeId(null, '站点')).toThrow();
    expect(() => normalizeId([1], '站点')).toThrow();
    expect(() => normalizeId({ x: 1 }, '站点')).toThrow();
    expect(() => normalizeId(NaN, '链路')).toThrow();
    expect(() => normalizeId(Infinity, '链路')).toThrow();
    expect(() => normalizeId(1.5, '站点')).toThrow();
    expect(() => normalizeId(Number.MAX_SAFE_INTEGER + 1, '站点')).toThrow();
  });
});

describe('compareUtf8 — UTF-8 字节序列排序口径', () => {
  it('纯 ASCII 编号按字节字典序', () => {
    expect(compareUtf8('a', 'b')).toBeLessThan(0);
    expect(compareUtf8('L10', 'L2')).toBeLessThan(0); // 字节序而非数值序
    expect(compareUtf8('L2', 'L10')).toBeGreaterThan(0);
    expect(compareUtf8('x', 'x')).toBe(0);
  });

  it('数字按编码后的字符串字节比较', () => {
    expect(compareUtf8('10', '9')).toBeLessThan(0);
  });

  it('多字节中文按 UTF-8 无符号字节比较，且结论稳定', () => {
    const ids = ['链路乙', 'L9', '链路甲', 'L100', '中', 'a'];
    const sorted = [...ids].sort(compareUtf8);
    expect(sorted).toEqual([...ids].sort(compareUtf8)); // 稳定性/幂等
    // 字节序：L* (0x4C) < a (0x61) < 中 (0xE4..) < 链* (0xE9..)；
    // 「链路乙」末字 乙(E4 B9 99) 早于 甲(E7 94 B2)
    expect(sorted).toEqual(['L100', 'L9', 'a', '中', '链路乙', '链路甲']);
  });
});
