require("dotenv").config();
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const { Connection, PublicKey, Keypair, Transaction, SystemProgram } = require("@solana/web3.js");
const { createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const { getPumpCurveState, calculatePumpCurvePrice, buyToken, listenForCreateTransaction } = require("./buy.js");
const { sellToken } = require("./sell.js");

const RPC_ENDPOINT = process.env.RPC_ENDPOINT; // Load from .env
const WSS_ENDPOINT = process.env.WSS_ENDPOINT; // Load from .env
const BUY_AMOUNT = 1.0;
const BUY_SLIPPAGE = 0.01;
const SELL_SLIPPAGE = 0.01;

function logTrade(action, tokenData, price, txHash) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        action,
        token_address: tokenData.mint,
        price,
        tx_hash: txHash,
    };
    fs.mkdirSync("trades", { recursive: true });
    fs.appendFileSync("trades/trades.log", JSON.stringify(logEntry) + "\n");
}

async function trade(websocket, matchString = null, broAddress = null, marryMode = false, yoloMode = false) {
    while (true) {
        console.log("Waiting for a new token creation...");
        const tokenData = await listenForCreateTransaction(websocket);
        console.log("New token created:", JSON.stringify(tokenData, null, 2));

        if (matchString && ![tokenData.name, tokenData.symbol].some(str => str.toLowerCase().includes(matchString.toLowerCase()))) {
            console.log(`Token does not match the criteria '${matchString}'. Skipping...`);
            if (!yoloMode) break;
            continue;
        }

        if (broAddress && tokenData.user !== broAddress) {
            console.log(`Token not created by the specified user '${broAddress}'. Skipping...`);
            if (!yoloMode) break;
            continue;
        }

        const mintAddress = tokenData.mint;
        fs.mkdirSync("trades", { recursive: true });
        fs.writeFileSync(path.join("trades", `${mintAddress}.txt`), JSON.stringify(tokenData, null, 2));
        console.log(`Token information saved to trades/${mintAddress}.txt`);

        console.log("Waiting for 15 seconds for things to stabilize...");
        await new Promise(resolve => setTimeout(resolve, 15000));

        const mint = new PublicKey(tokenData.mint);
        const bondingCurve = new PublicKey(tokenData.bondingCurve);
        const associatedBondingCurve = new PublicKey(tokenData.associatedBondingCurve);

        const connection = new Connection(RPC_ENDPOINT, "confirmed");
        const curveState = await getPumpCurveState(connection, bondingCurve);
        const tokenPriceSol = calculatePumpCurvePrice(curveState);

        console.log(`Bonding curve address: ${bondingCurve.toBase58()}`);
        console.log(`Token price: ${tokenPriceSol.toFixed(10)} SOL`);
        console.log(`Buying ${BUY_AMOUNT.toFixed(6)} SOL worth of the new token with ${(BUY_SLIPPAGE * 100).toFixed(1)}% slippage tolerance...`);

        const buyTxHash = await buyToken(mint, bondingCurve, associatedBondingCurve, BUY_AMOUNT, BUY_SLIPPAGE);
        if (buyTxHash) {
            logTrade("buy", tokenData, tokenPriceSol, buyTxHash);
        } else {
            console.log("Buy transaction failed.");
        }

        // if (!marryMode) {
        //     console.log("Waiting for 20 seconds before selling...");
        //     await new Promise(resolve => setTimeout(resolve, 20000));

        //     console.log(`Selling tokens with ${(SELL_SLIPPAGE * 100).toFixed(1)}% slippage tolerance...`);
        //     const sellTxHash = await sellToken(mint, bondingCurve, associatedBondingCurve, SELL_SLIPPAGE);
        //     if (sellTxHash) {
        //         logTrade("sell", tokenData, tokenPriceSol, sellTxHash);
        //     } else {
        //         console.log("Sell transaction failed or no tokens to sell.");
        //     }
        // } else {
        //     console.log("Marry mode enabled. Skipping sell operation.");
        // }

        if (!yoloMode) break;
    }
}

async function main({ yoloMode, matchString, broAddress, marryMode }) {
    if (yoloMode) {
        while (true) {
            try {
                const websocket = new WebSocket(WSS_ENDPOINT);
                websocket.on("open", async () => {
                    try {
                        await trade(websocket, matchString, broAddress, marryMode, yoloMode);
                    } catch (err) {
                        console.error("Trade error:", err.message);
                    }
                });

                websocket.on("close", () => {
                    console.log("WebSocket connection closed. Reconnecting...");
                });
            } catch (err) {
                console.error("Connection error:", err.message);
                console.log("Reconnecting in 5 seconds...");
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    } else {
        const websocket = new WebSocket(WSS_ENDPOINT);
        websocket.on("open", async () => {
            await trade(websocket, matchString, broAddress, marryMode, yoloMode);
        });
    }
}

const args = require("minimist")(process.argv.slice(2));
const options = {
    yoloMode: args["yolo"] || false,
    matchString: args["match"] || null,
    broAddress: args["bro"] || null,
    marryMode: args["marry"] || false,
};

main(options).catch(err => console.error("Unhandled error:", err));
