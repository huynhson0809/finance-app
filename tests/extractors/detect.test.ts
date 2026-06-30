import { describe, it, expect } from 'vitest';
import { detectBank } from '../../src/extractors/detect';

describe('detectBank', () => {
  it('returns null for empty input', () => {
    expect(detectBank('')).toBeNull();
  });
  it('returns null when no fingerprints match', () => {
    expect(detectBank('Highlands Coffee 45000đ')).toBeNull();
  });
  it('identifies Vietcombank from "Vietcombank" keyword', () => {
    expect(detectBank('Vietcombank thông báo giao dịch')).toBe('vietcombank');
  });
  it('identifies Vietcombank from VCB acronym', () => {
    expect(detectBank('VCB: -250.000 đ Số dư: 1.000.000')).toBe('vietcombank');
  });
  it('identifies Techcombank', () => {
    expect(detectBank('Techcombank Mobile - giao dịch thành công')).toBe('techcombank');
  });
  it('identifies MoMo', () => {
    expect(detectBank('Ví MoMo - Thanh toán -50.000đ')).toBe('momo');
  });
  it('identifies ZaloPay', () => {
    expect(detectBank('ZaloPay: nạp tiền 100.000đ')).toBe('zalopay');
  });
  it('picks the bank with the most fingerprint matches', () => {
    expect(detectBank('Vietcombank VCB Số dư mention of MoMo')).toBe('vietcombank');
  });
});
