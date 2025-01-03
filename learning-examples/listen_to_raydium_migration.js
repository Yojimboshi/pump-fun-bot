const WebSocket = require("ws");
const { WSS_ENDPOINT, PUMP_LIQUIDITY_MIGRATOR } = require("./config");

function processInitialize2Transaction(data) {
    try {
        const signature = data.transaction.signatures[0];
        const accountKeys = data.transaction.message.accountKeys;

        if (accountKeys.length > 18) {
            const tokenAddress = accountKeys[18];
            const liquidityAddress = accountKeys[2];

            console.log("\nSignature:", signature);
            console.log("Token Address:", tokenAddress);
            console.log("Liquidity Address:", liquidityAddress);
            console.log("=".repeat(50));
        } else {
            console.error(`\nError: Not enough account keys (found ${accountKeys.length})`);
        }
    } catch (error) {
        console.error(`\nError processing transaction: ${error.message}`);
    }
}

async function listenForEvents() {
    while (true) {
        try {
            const websocket = new WebSocket(WSS_ENDPOINT);

            websocket.on("open", () => {
                const subscriptionMessage = JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "blockSubscribe",
                    params: [
                        { mentionsAccountOrProgram: PUMP_LIQUIDITY_MIGRATOR },
                        {
                            commitment: "confirmed",
                            encoding: "json",
                            showRewards: false,
                            transactionDetails: "full",
                            maxSupportedTransactionVersion: 0,
                        },
                    ],
                });

                websocket.send(subscriptionMessage);
                console.log("Subscription sent.");
                console.log("\nListening for Raydium pool initialization events...");
            });

            websocket.on("message", (data) => {
                try {
                    const parsedData = JSON.parse(data);

                    if (
                        parsedData.method === "blockNotification" &&
                        parsedData.params &&
                        parsedData.params.result
                    ) {
                        const blockData = parsedData.params.result;

                        if (blockData.value && blockData.value.block) {
                            const block = blockData.value.block;

                            if (block.transactions) {
                                for (const tx of block.transactions) {
                                    const logs = tx.meta?.logMessages || [];

                                    for (const log of logs) {
                                        if (log.includes("Program log: initialize2: InitializeInstruction2")) {
                                            console.log("Found initialize2 instruction!");
                                            processInitialize2Transaction(tx);
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error(`\nError parsing message: ${error.message}`);
                }
            });

            websocket.on("close", () => {
                console.log("Connection closed. Reconnecting in 5 seconds...");
                setTimeout(listenForEvents, 5000);
            });

            websocket.on("error", (error) => {
                console.error(`\nWebSocket error: ${error.message}`);
            });
        } catch (error) {
            console.error(`\nConnection error: ${error.message}`);
            console.log("Retrying in 5 seconds...");
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }
}

if (require.main === module) {
    listenForEvents();
}
