# Stablenotes Client

Javascript client to connect to the private and secure Stablenotes digital cash system.

Supports any environment that has access to WebCrypto subtle. (Node >v15.0.0, Chrome >v37, Firefox >v34, and Safari >v11)

Full compatibility is available [here](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto#browser_compatibility)

The client is fully typed and contains Typescript types in the bundle

## Table of Contents

- [Stablenotes Client](#stablenotes-client)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
  - [Important Notice Regarding Balances](#important-notice-regarding-balances)
  - [Usage](#usage)
    - [`Initialization`](#initialization)
    - [`Response Format`](#response-format)
    - [`Client.register`](#clientregister)
    - [`Client.getBalance`](#clientgetbalance)
    - [`Client.createRecipientId`](#clientcreaterecipientid)
    - [`Client.recipientInfo`](#clientrecipientinfo)
    - [`Client.transfer`](#clienttransfer)
    - [`Client.createTransferRequest`](#clientcreatetransferrequest)
    - [`Client.transferRequestInfo`](#clienttransferrequestinfo)
    - [`Client.payTransferRequest`](#clientpaytransferrequest)

## Installation

```sh
npm install @stablenotes/client
yarn add @stablenotes/client
pnpm add @stablenotes/client
bun add @stablenotes/client
```

## Important Notice Regarding Balances

All amounts and balances are encoded as an integer number of cents. You must pass in a value of `100` in order to transfer $1, and a balance of `100` is a balance of $1

## Usage

### `Initialization`

Client is a class that contains all the methods for managing a wallet on the Stablenotes protocol. Initialize it with the base url for the environment you intend to connect to.

```js
import { Client } from "@stablenotes/client";

const client = new Client({
	baseUrl: "https://example.com",
});
```

If you have previously registered a wallet, pass it in to continue using it.

The private key must be a WebCrypto "CryptoKey" object.

```js
import { Client } from "@stablenotes/client";

const client = new Client({
	baseUrl: "https://example.com",
	wallet: {
		id: "00000000-0000-0000-0000-000000000000",
		privateKey: ...
	},
});
```

### `Response Format`

All the requests made by client will return the following format.

If the response is successful:

```ts
{
	request: Request;
	data: {
		// The information returned by the request
	}
	error: undefined;
}
```

And if the response is unsuccessful

```ts
{
	request: Request;
	data: undefined;
	error: {
		status: number;
		code: string;
		message: string;
		// There will also optionally be extra details that include information about the error.
		exampleInfo: string;
	}
}
```

### `Client.register`

To register a new wallet, call `Client.register(Currency)`.

Allowed currencies are "GBP" and "USD"

`Client.register` will save the private private key in the Client for authorization of future requests.

You must save the output of this function in order to reuse this wallet. If you do not, there is no way of recovering funds in the wallet.

```js
const result = await client.register("USD");

if (result.data) {
	console.log(result.data.id);
	console.log(result.data.privateKey);
}
```

Optionally, include an existing RSA private key to use for the wallet authentication with `Client.register(Currency, CryptoKey)`.

```js
// Get your private key, ensure it is a WebCrypto "CryptoKey" object
const privateKey = ...
const result = await client.register("USD", privateKey);

if (result.data) {
	console.log(result.data.id);
	console.log(result.data.privateKey);
}
if (result.error) {
	console.error(result.error);
}
```

Alternatively, the private key object can be an object with a hex or base64 encoded string as well as the encoding type. The string can be generated from `client.getWalletString`

```js
await client1.register("USD");
const privateKeyHex = client1.getWalletString("hex");
const privateKeyBase64 = client1.getWalletString("base64");

// Register a client with the string
await client2.register("USD", {
	id: "00000000-0000-0000-0000-000000000000",
	privateKey: {
		key: privateKeyHex,
		encoding: "hex",
	},
});
// OR
await client2.register("USD", {
	id: "00000000-0000-0000-0000-000000000000",
	privateKey: {
		key: privateKeyBase64,
		encoding: "base64",
	},
});
```

### `Client.getBalance`

Gets the currency and current balance of the wallet.

You must have either used `Client.register` or passed in a private key on initialization to call this function.

```js
const result = await client.getBalance();

if (result.data) {
	// IMPORTANT: This value is in cents
	console.log(result.data.balance);
	console.log(result.data.currency);
}
if (result.error) {
	console.error(result.error);
}
```

### `Client.createRecipientId`

Creates an id to receive a transfer with. This should be sent to the user who wishes to transfer funds into this wallet.

You must have either used `Client.register` or passed in a private key on initialization to call this function.

```js
const result = await client.createRecipientId();

if (result.data) {
	console.log(result.data.id);
}
if (result.error) {
	console.error(result.error);
}
```

### `Client.recipientInfo`

Gets information about a recipient.

This function does not require auth, and may be used without calling register() or providing a wallet private key

```js
const recipientId = ...
const result = await client.recipientInfo(recipientId);

if (result.data) {
	console.log(result.data.id);
	console.log(result.data.currency);
}
if (result.error) {
	console.error(result.error);
}
```

### `Client.transfer`

Transfers funds to the recipientId provided. Please ensure that this is the intended recipient as there is no way to undo this action.

You must have either used `Client.register` or passed in a private key on initialization to call this function.

```js
const recipientId = ...
// IMPORTANT: This value is in cents.
const amount = ...
const result = await client.transfer(recipientId, amount);

if (result.data) {
	// Your wallet balance after the transfer
	// IMPORTANT: This value is in cents
	console.log(result.data.walletBalance);
}
if (result.error) {
	console.error(result.error);
}
```

### `Client.createTransferRequest`

Creates a transfer request that you can send to a user to request that they pay you a certain amount.

In order to determine if the transfer request has been paid, after a successful transfer request creation, `Client.transferRequestInfo` can be called. However, due to minimal data storage of Stablenotes, upon a complete transfer request, any record of the transfer request is deleted. Therefore you can check if it has been completed as you will receive an error with the code `"TRANSFER_REQUEST_NOT_FOUND"`.

You must have either used `Client.register` or passed in a private key on initialization to call this function.

```js
// IMPORTANT: This value is in cents.
const amount = ...
const result = await client.createTransferRequest(amount);

if (result.data) {
	console.log(result.data.id);
	// IMPORTANT: This value is in cents
	console.log(result.data.amount);
}
if (result.error) {
	console.error(result.error);
}
```

### `Client.transferRequestInfo`

Gets information about a transfer request.

This function does not require auth, and may be used without calling register() or providing a wallet private key

```js
const transferRequestId = ...
const result = await client.transferRequestInfo(transferRequestId);

if (result.data) {
	console.log(result.data.id);
	// IMPORTANT: This value is in cents
	console.log(result.data.amount);
	console.log(result.data.currency);
}
if (result.error) {
	console.error(result.error);
	if(result.error.code === "TRANSFER_REQUEST_NOT_FOUND") {
		// Either the request never existed, or if it did it is now
		// complete and has been removed from the Stablenotes database
	}
}
```

### `Client.payTransferRequest`

Pays a transfer request. Please ensure that this is the intended recipient and that the amount is correct. The amount can be checked with `Client.transferRequestInfo`.

You must have either used `Client.register` or passed in a private key on initialization to call this function.

```js
const transferRequestId = ...
const result = await client.transfer(transferRequestId);

if (result.data) {
	// Your wallet balance after the transfer
	// IMPORTANT: This value is in cents
	console.log(result.data.walletBalance);
}
if (result.error) {
	console.error(result.error);
}
```
