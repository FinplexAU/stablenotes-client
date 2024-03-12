import createClient from "openapi-fetch";
import { components, paths } from "./api";

const getCrypto = async (): Promise<Crypto> => {
	if (globalThis.crypto) {
		return Promise.resolve(globalThis.crypto);
	} else {
		if (typeof window === "undefined") {
			throw new Error("WebCrypto not found while on a browser.");
		}
		return (await import("node:crypto")).webcrypto as Crypto;
	}
};

type ApiClient = ReturnType<typeof createClient<paths>>;

export type Currency = components["schemas"]["Currency"];
export type Wallet = {
	id: string;
	privateKey: Promise<CryptoKey> | CryptoKey;
};
export type WalletInput = {
	id: string;
	privateKey:
		| CryptoKey
		| {
				key: string;
				encoding: "base64" | "hex";
		  };
};
export type ClassOptions = {
	baseUrl: string;
	wallet?: WalletInput;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
	var binary = "";
	var bytes = new Uint8Array(buffer);
	var len = bytes.byteLength;
	for (var i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]!);
	}
	return btoa(binary);
};
const base64ToArrayBuffer = (base64: string) => {
	var binaryString = atob(base64);
	var bytes = new Uint8Array(binaryString.length);
	for (var i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes.buffer;
};
const hexToArrayBuffer = (hex: string) => {
	const matched = hex.match(/[\da-f]{2}/gi);
	if (!matched) return new ArrayBuffer(0);
	return new Uint8Array(
		matched.map(function (h) {
			return parseInt(h, 16);
		})
	).buffer;
};
const arrayBufferToHex = (buffer: ArrayBuffer) => {
	return [...new Uint8Array(buffer)]
		.map((x) => x.toString(16).padStart(2, "0"))
		.join("");
};

export class Client {
	readonly baseUrl: string;
	private client: ApiClient;
	private wallet?: Wallet;
	private crypto = getCrypto();

	constructor(options: ClassOptions) {
		this.baseUrl = options.baseUrl;
		this.client = createClient<paths>({
			baseUrl: this.baseUrl,
		});
		if (options?.wallet) {
			if (options.wallet.privateKey instanceof CryptoKey) {
				this.wallet = {
					id: options.wallet.id,
					privateKey: options.wallet.privateKey,
				};
			} else {
				const pk = options.wallet.privateKey;
				let key;

				if (pk.encoding === "hex") {
					key = hexToArrayBuffer(pk.key);
				} else {
					key = base64ToArrayBuffer(pk.key);
				}

				const privateKey = crypto.subtle.importKey(
					"pkcs8",
					key,
					{
						name: "RSASSA-PKCS1-v1_5",
						hash: "SHA-512",
					},
					false,
					["sign"]
				);

				this.wallet = {
					id: options.wallet.id,
					privateKey,
				};
			}
		}

		this.client.use({
			onRequest: async (req) => {
				if (req.method !== "get" && this.wallet) {
					const body = await req.clone().arrayBuffer();
					const alg = "RSA-SHA512";
					const privateKey = await this.wallet.privateKey;

					const sig = await (
						await this.crypto
					).subtle.sign("RSASSA-PKCS1-v1_5", privateKey, body);

					req.headers.set("Wallet-Id", this.wallet.id);
					req.headers.set("Signature", arrayBufferToBase64(sig));
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
			const jwk = await (await this.crypto).subtle.exportKey("jwk", sk);

			delete jwk.d;
			delete jwk.dp;
			delete jwk.dq;
			delete jwk.q;
			delete jwk.qi;
			jwk.key_ops = ["verify"];

			pk = await (
				await this.crypto
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
				await this.crypto
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

		const out = await (await this.crypto).subtle.exportKey("spki", pk);
		const b64 = arrayBufferToBase64(out);

		const response = await this.client.POST("/v1/register", {
			body: {
				currency,
				publicKey: b64,
			},
		});

		if (response.data) {
			const wallet = { id: response.data.id, privateKey: sk };
			this.wallet = wallet;
			return {
				...response,
				data: response.data
					? {
							...wallet,
					  }
					: undefined,
			};
		}
		return response;
	}

	public async getWalletString(encoding: "hex" | "base64" = "hex") {
		if (!this.wallet) {
			return;
		}

		const pk = await this.wallet.privateKey;
		const privateKey = await crypto.subtle.exportKey("pkcs8", pk);
		if (encoding === "hex") {
			return arrayBufferToHex(privateKey);
		} else {
			return arrayBufferToBase64(privateKey);
		}
	}

	public async getBalance() {
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
