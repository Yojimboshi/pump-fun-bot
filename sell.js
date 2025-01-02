const base58 = require("bs58");
const { Connection, PublicKey, Keypair, Transaction, SystemProgram } = require("@solana/web3.js");
const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const { struct, u64, blob } = require("buffer-layout");

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_ENDPOINT = "https://api.mainnet-beta.solana.com";
const LAMPORTS_PER_SOL = 10 ** 9;
const TOKEN_DECIMALS = 6;

const PUMP_GLOBAL = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");
const PUMP_FEE = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");
const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const SYSTEM_PROGRAM = SystemProgram.programId;
const SYSTEM_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const PUMP_EVENT_AUTHORITY = new PublicKey("E7vih47WnrJqzr1cYECkPMzqQUtW7H813Y3gaB6ppump");

async function getTokenBalance(connection, associatedTokenAccount) {
    const response = await connection.getTokenAccountBalance(associatedTokenAccount);
    return response.value ? parseInt(response.value.amount) : 0;
}

async function getPumpCurveState(connection, curveAddress) {
    const accountInfo = await connection.getAccountInfo(curveAddress);
    if (!accountInfo || !accountInfo.data) {
        throw new Error("Invalid curve state: No data");
    }

    const data = accountInfo.data;
    const discriminator = Buffer.from("1234567890abcdef", "hex"); // Replace with actual discriminator
    if (!data.slice(0, 8).equals(discriminator)) {
        throw new Error("Invalid curve state discriminator");
    }

    const layout = struct([
        u64("virtualTokenReserves"),
        u64("virtualSolReserves"),
        u64("realTokenReserves"),
        u64("realSolReserves"),
        u64("tokenTotalSupply"),
        blob(1, "complete")
    ]);

    return layout.decode(data.slice(8));
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

async function sellToken(mint, bondingCurve, associatedBondingCurve, slippage = 0.25, maxRetries = 5) {
    const privateKey = base58.decode(PRIVATE_KEY);
    const payer = Keypair.fromSecretKey(privateKey);
    const connection = new Connection(RPC_ENDPOINT, "confirmed");

    const associatedTokenAccount = await getAssociatedTokenAddress(mint, payer.publicKey);

    const tokenBalance = await getTokenBalance(connection, associatedTokenAccount);
    const tokenBalanceDecimal = tokenBalance / 10 ** TOKEN_DECIMALS;
    console.log(`Token balance: ${tokenBalanceDecimal}`);

    if (tokenBalance === 0) {
        console.log("No tokens to sell.");
        return;
    }

    const curveState = await getPumpCurveState(connection, bondingCurve);
    const tokenPriceSol = calculatePumpCurvePrice(curveState);
    console.log(`Price per Token: ${tokenPriceSol.toFixed(20)} SOL`);

    const amount = tokenBalance;
    let minSolOutput = tokenBalanceDecimal * tokenPriceSol * (1 - slippage);
    minSolOutput = Math.floor(minSolOutput * LAMPORTS_PER_SOL);

    console.log(`Selling ${tokenBalanceDecimal} tokens`);
    console.log(`Minimum SOL output: ${(minSolOutput / LAMPORTS_PER_SOL).toFixed(10)} SOL`);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const accounts = [
                { pubkey: PUMP_GLOBAL, isSigner: false, isWritable: false },
                { pubkey: PUMP_FEE, isSigner: false, isWritable: true },
                { pubkey: mint, isSigner: false, isWritable: false },
                { pubkey: bondingCurve, isSigner: false, isWritable: true },
                { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
                { pubkey: associatedTokenAccount, isSigner: false, isWritable: true },
                { pubkey: payer.publicKey, isSigner: true, isWritable: true },
                { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
                { pubkey: SYSTEM_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM, isSigner: false, isWritable: false },
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
                { pubkey: PUMP_PROGRAM, isSigner: false, isWritable: false },
            ];

            const discriminator = Buffer.from("abcdef1234567890", "hex"); // Replace with actual discriminator
            const data = Buffer.concat([
                discriminator,
                Buffer.alloc(8, amount),
                Buffer.alloc(8, minSolOutput),
            ]);

            const sellIx = new TransactionInstruction({
                programId: PUMP_PROGRAM,
                keys: accounts,
                data,
            });

            const transaction = new Transaction().add(sellIx);
            const recentBlockhash = await connection.getLatestBlockhash();
            transaction.recentBlockhash = recentBlockhash.blockhash;
            transaction.feePayer = payer.publicKey;

            const signature = await connection.sendTransaction(transaction, [payer], { skipPreflight: true });
            console.log(`Transaction sent: https://explorer.solana.com/tx/${signature}`);

            await connection.confirmTransaction(signature, "confirmed");
            console.log("Transaction confirmed");

            return signature;
        } catch (error) {
            console.error(`Attempt ${attempt + 1} failed: ${error.message}`);
            if (attempt < maxRetries - 1) {
                const waitTime = 2 ** attempt;
                console.log(`Retrying in ${waitTime} seconds...`);
                await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
            } else {
                console.error("Max retries reached. Unable to complete the transaction.");
            }
        }
    }
}

module.exports = { sellToken };