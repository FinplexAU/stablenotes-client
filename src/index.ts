import createClient from "openapi-fetch";
import { components, paths } from "./api";
import crypto, { KeyObject } from "node:crypto";

type ApiClient = ReturnType<typeof createClient<paths>>;

export type Currency = components["schemas"]["Currency"];
export type Wallet = { privateKey: crypto.KeyObject; id: string };
export type ClassOptions = {
	baseUrl: string;
	wallet?: Wallet;
};

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
					const sig = crypto.sign(
						alg,
						Buffer.from(body),
						this.wallet.privateKey
					);
					req.headers.set("Wallet-Id", this.wallet.id);
					req.headers.set("Signature", sig.toString("base64"));
					req.headers.set("Signature-Algorithm", alg);
				}
				return req;
			},
		});
	}

	public async register(currency: Currency, privateKey?: KeyObject) {
		let sk: KeyObject;
		let pk: KeyObject;
		if (privateKey) {
			sk = privateKey;
			pk = crypto.createPublicKey(privateKey);
		} else {
			const keyPair = crypto.generateKeyPairSync("rsa", {
				modulusLength: 2048,
			});
			sk = keyPair.privateKey;
			pk = keyPair.publicKey;
		}

		const response = await this.client.POST("/v1/register", {
			body: {
				currency,
				publicKey: pk
					.export({
						format: "der",
						type: "spki",
					})
					.toString("base64"),
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
