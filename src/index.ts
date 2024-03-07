import createClient from "openapi-fetch";
import { components, paths } from "./api";

const getCrypto = async (): Promise<Crypto> => {
	if (globalThis.crypto) {
		return Promise.resolve(globalThis.crypto);
	} else {
		return (await import("node:crypto")).webcrypto as Crypto;
	}
};
const crypto = getCrypto();

type ApiClient = ReturnType<typeof createClient<paths>>;

export type Currency = components["schemas"]["Currency"];
export type Wallet = {
	privateKey: CryptoKey;
	id: string;
};
export type ClassOptions = {
	baseUrl: string;
	wallet?: Wallet;
};

function _arrayBufferToBase64(buffer: ArrayBuffer) {
	var binary = "";
	var bytes = new Uint8Array(buffer);
	var len = bytes.byteLength;
	for (var i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]!);
	}
	return btoa(binary);
}

export class Client {
	readonly baseUrl: string;
	private client: ApiClient;
	private wallet?: Wallet;

	constructor(options: ClassOptions) {
		this.baseUrl = options.baseUrl;
		this.client = createClient<paths>({
			baseUrl: this.baseUrl,
		});
		if (options?.wallet) {
			this.wallet = { ...options.wallet };
		}

		this.client.use({
			onRequest: async (req, options) => {
				if (req.method !== "get" && this.wallet) {
					const body = await req.clone().arrayBuffer();
					const alg = "RSA-SHA512";
					const sig = await (
						await crypto
					).subtle.sign("RSASSA-PKCS1-v1_5", this.wallet.privateKey, body);

					req.headers.set("Wallet-Id", this.wallet.id);
					req.headers.set("Signature", _arrayBufferToBase64(sig));
					req.headers.set("Signature-Algorithm", alg);
				}
				return req;
			},
		});
	}

	public async register(currency: Currency, privateKey?: CryptoKey) {
		let sk: CryptoKey;
		let pk: CryptoKey;
		if (privateKey) {
			sk = privateKey;
			const jwk = await (await crypto).subtle.exportKey("jwk", sk);

			delete jwk.d;
			delete jwk.dp;
			delete jwk.dq;
			delete jwk.q;
			delete jwk.qi;
			jwk.key_ops = ["verify"];

			pk = await (
				await crypto
			).subtle.importKey(
				"jwk",
				jwk,
				{
					name: "RSASSA-PKCS1-v1_5",
					hash: "SHA-512",
				},
				true,
				["verify"]
			);
		} else {
			const kp = await (
				await crypto
			).subtle.generateKey(
				{
					name: "RSASSA-PKCS1-v1_5",
					modulusLength: 2048,
					hash: "SHA-512",
					publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
				} as any,
				true,
				["sign", "verify"]
			);
			sk = kp.privateKey;
			pk = kp.publicKey;
		}

		const out = await (await crypto).subtle.exportKey("spki", pk);
		const b64 = _arrayBufferToBase64(out);

		const response = await this.client.POST("/v1/register", {
			body: {
				currency,
				publicKey: b64,
			},
		});

		if (response.data) {
			this.wallet = { id: response.data.id, privateKey: sk };
		}

		return response;
	}

	public async balance() {
		const response = await this.client.POST("/v1/balance", {
			params: {
				// The headers get set in the middleware
				header: undefined as any,
			},
			body: { iat: Date.now() },
		});

		return response;
	}

	public async recipientInfo(id: string) {
		const response = await this.client.GET("/v1/recipient/{id}", {
			params: {
				path: {
					id,
				},
			},
		});

		return response;
	}

	public async createRecipientId() {
		const response = await this.client.POST("/v1/recipient", {
			params: {
				// The headers get set in the middleware
				header: undefined as any,
			},
			body: { iat: Date.now() },
		});

		return response;
	}

	public async transfer(recipientId: string, amount: number) {
		const response = await this.client.POST("/v1/transfer", {
			params: {
				// The headers get set in the middleware
				header: undefined as any,
			},
			body: { iat: Date.now(), recipient: recipientId, amount },
		});

		return response;
	}

	public async transferRequestInfo(id: string) {
		const response = await this.client.GET("/v1/transfer-request/{id}", {
			params: {
				path: {
					id,
				},
			},
		});

		return response;
	}

	public async createTransferRequest(amount: number) {
		const response = await this.client.POST("/v1/transfer-request", {
			params: {
				// The headers get set in the middleware
				header: undefined as any,
			},
			body: { iat: Date.now(), amount },
		});

		return response;
	}

	public async payTransferRequest(id: string) {
		const response = await this.client.POST("/v1/transfer-request/pay", {
			params: {
				// The headers get set in the middleware
				header: undefined as any,
			},
			body: { iat: Date.now(), transferRequest: id },
		});

		return response;
	}
}
