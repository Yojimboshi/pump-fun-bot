const WebSocket = require("ws");
const { Connection, PublicKey, Keypair, Transaction, SystemProgram } = require("@solana/web3.js");
const bs58 = require("bs58");
const fs = require("fs");
const path = require("path");
const { getAssociatedTokenAddress } = require("@solana/spl-token");
const { RPC_ENDPOINT, WSS_ENDPOINT, PUMP_PROGRAM, PRIVATE_KEY, LAMPORTS_PER_SOL, TOKEN_DECIMALS } = require("./config");

async function getPumpCurveState(connection, curveAddress) {
    const accountInfo = await connection.getAccountInfo(curveAddress);
    if (!accountInfo || !accountInfo.data) {
        throw new Error("Invalid curve state: No data");
    }

    return {
        virtualTokenReserves: accountInfo.data.readBigUInt64LE(8),
        virtualSolReserves: accountInfo.data.readBigUInt64LE(16),
        realTokenReserves: accountInfo.data.readBigUInt64LE(24),
        realSolReserves: accountInfo.data.readBigUInt64LE(32),
        tokenTotalSupply: accountInfo.data.readBigUInt64LE(40),
        complete: accountInfo.data[48] === 1,
    };
}

function calculatePumpCurvePrice(curveState) {
    if (curveState.virtualTokenReserves <= 0 || curveState.virtualSolReserves <= 0) {
        throw new Error("Invalid reserve state");
    }

    return (
        curveState.virtualSolReserves / LAMPORTS_PER_SOL /
        (curveState.virtualTokenReserves / 10 ** TOKEN_DECIMALS)
    );
}

async function buyToken(mint, bondingCurve, associatedBondingCurve, amount, slippage = 0.01, maxRetries = 5) {
    const connection = new Connection(RPC_ENDPOINT, "confirmed");
    const privateKey = bs58.decode(PRIVATE_KEY);
    const payer = Keypair.fromSecretKey(privateKey);

    const associatedTokenAccount = await getAssociatedTokenAddress(mint, payer.publicKey);
    const amountLamports = Math.floor(amount * LAMPORTS_PER_SOL);

    const curveState = await getPumpCurveState(connection, bondingCurve);
    const tokenPriceSol = calculatePumpCurvePrice(curveState);
    const tokenAmount = amount / tokenPriceSol;
    const maxAmountLamports = Math.floor(amountLamports * (1 + slippage));

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const accountInfo = await connection.getAccountInfo(associatedTokenAccount);
            if (!accountInfo) {
                console.log("Creating associated token account...");

                const ataInstruction = SystemProgram.createAccount({
                    fromPubkey: payer.publicKey,
                    newAccountPubkey: associatedTokenAccount,
                    space: 165,
                    lamports: await connection.getMinimumBalanceForRentExemption(165),
                    programId: TOKEN_PROGRAM_ID,
                });
                const ataTransaction = new Transaction().add(ataInstruction);
                const blockhash = await connection.getLatestBlockhash();
                ataTransaction.recentBlockhash = blockhash.blockhash;
                ataTransaction.feePayer = payer.publicKey;

                await connection.sendTransaction(ataTransaction, [payer]);
                console.log("Associated token account created.");
            } else {
                console.log("Associated token account already exists.");
            }
            break;
        } catch (error) {
            console.error(`ATA creation attempt ${attempt + 1} failed:`, error.message);
            if (attempt === maxRetries - 1) {
                throw new Error("Failed to create associated token account after maximum retries.");
            }
            await new Promise(resolve => setTimeout(resolve, 2 ** attempt * 1000));
        }
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const accounts = [
                { pubkey: bondingCurve, isSigner: false, isWritable: true },
                { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
                { pubkey: associatedTokenAccount, isSigner: false, isWritable: true },
                { pubkey: payer.publicKey, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ];

            const data = Buffer.concat([
                Buffer.from("12345678", "hex"), // Replace with actual discriminator
                Buffer.alloc(8, Math.floor(tokenAmount * 10 ** TOKEN_DECIMALS)),
                Buffer.alloc(8, maxAmountLamports),
            ]);

            const transaction = new Transaction();
            transaction.add({ programId: bondingCurve, keys: accounts, data });
            const blockhash = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash.blockhash;
            transaction.feePayer = payer.publicKey;

            const signature = await connection.sendTransaction(transaction, [payer], { skipPreflight: true });
            console.log(`Transaction sent: https://explorer.solana.com/tx/${signature}`);

            await connection.confirmTransaction(signature, "confirmed");
            console.log("Transaction confirmed");

            return signature;
        } catch (error) {
            console.error(`Transaction attempt ${attempt + 1} failed:`, error.message);
            if (attempt === maxRetries - 1) {
                throw new Error("Failed to complete transaction after maximum retries.");
            }
            await new Promise(resolve => setTimeout(resolve, 2 ** attempt * 1000));
        }
    }
}

async function listenForCreateTransaction() {
    const websocket = new WebSocket(WSS_ENDPOINT);

    websocket.on("open", () => {
        const subscriptionMessage = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "blockSubscribe",
            params: [
                { mentionsAccountOrProgram: PUMP_PROGRAM },
                {
                    commitment: "confirmed",
                    encoding: "base64",
                    showRewards: false,
                    transactionDetails: "full",
                    maxSupportedTransactionVersion: 0,
                },
            ],
        });
        websocket.send(subscriptionMessage);
        console.log("Subscribed to blocks mentioning program.");
    });

    websocket.on("message", (data) => {
        const parsedData = JSON.parse(data);
        if (parsedData.method === "blockNotification") {
            console.log("Received block notification", parsedData);
        }
    });

    websocket.on("error", (error) => {
        console.error("WebSocket error:", error.message);
    });

    websocket.on("close", () => {
        console.log("WebSocket closed.");
    });
}

module.exports = { getPumpCurveState, calculatePumpCurvePrice, buyToken, listenForCreateTransaction };
