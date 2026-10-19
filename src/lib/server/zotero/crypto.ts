// Zotero 계정 키 암호화. 형식: v1.<iv>.<tag>.<암호문> (base64url, AES-256-GCM).
// 접두사 v1은 나중에 암호화 키를 바꿀 때 구분하는 용도다.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

function keyFrom(secret: string | undefined): Buffer {
	if (!secret) throw new Error('Zotero 키 암호화 비밀값(ZOTERO_KEY_ENCRYPTION_SECRET)이 설정되지 않았습니다.');
	const key = Buffer.from(secret, 'base64');
	if (key.length !== 32) {
		throw new Error('Zotero 키 암호화 비밀값은 base64로 쓴 32바이트여야 합니다.');
	}
	return key;
}

export function encryptSecret(plain: string, secret: string | undefined): string {
	const key = keyFrom(secret);
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [VERSION, iv.toString('base64url'), tag.toString('base64url'), body.toString('base64url')].join('.');
}

export function decryptSecret(token: string, secret: string | undefined): string {
	const key = keyFrom(secret);
	const parts = token.split('.');
	if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('암호문 형식이 올바르지 않습니다.');
	try {
		const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64url'));
		decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
		return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8');
	} catch {
		throw new Error('암호문을 풀 수 없습니다(변조되었거나 키가 다릅니다).');
	}
}
