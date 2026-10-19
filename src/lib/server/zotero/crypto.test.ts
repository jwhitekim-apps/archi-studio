import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './crypto';

const SECRET = Buffer.alloc(32, 7).toString('base64');

describe('zotero 키 암호화', () => {
	it('암호화한 값을 복호화하면 원문이 돌아온다', () => {
		const token = encryptSecret('zotero-api-key-123', SECRET);
		expect(token.startsWith('v1.')).toBe(true);
		expect(token).not.toContain('zotero-api-key-123');
		expect(decryptSecret(token, SECRET)).toBe('zotero-api-key-123');
	});

	it('같은 평문을 두 번 암호화하면 결과가 다르다', () => {
		expect(encryptSecret('same', SECRET)).not.toBe(encryptSecret('same', SECRET));
	});

	it('암호문 한 글자를 바꾸면 복호화에 실패한다', () => {
		const parts = encryptSecret('abc', SECRET).split('.');
		parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);
		expect(() => decryptSecret(parts.join('.'), SECRET)).toThrow();
	});

	it('다른 키로는 복호화되지 않는다', () => {
		const token = encryptSecret('abc', SECRET);
		expect(() => decryptSecret(token, Buffer.alloc(32, 9).toString('base64'))).toThrow();
	});

	it('키가 없거나 길이가 틀리면 키 값 없이 명확한 오류를 낸다', () => {
		expect(() => encryptSecret('abc', undefined)).toThrow(/ZOTERO_KEY_ENCRYPTION_SECRET/);
		const bad = Buffer.alloc(16, 1).toString('base64');
		try {
			encryptSecret('abc', bad);
			throw new Error('should fail');
		} catch (e) {
			expect((e as Error).message).toContain('32바이트');
			expect((e as Error).message).not.toContain(bad);
		}
	});
});
