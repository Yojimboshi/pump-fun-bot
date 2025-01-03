// learning-examples\check_bonding_curve_status.js
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { Connection, PublicKey } = require("@solana/web3.js");
const { PUMP_PROGRAM } = require("../config");
const RPC_ENDPOINT = process.env.RPC_ENDPOINT;

// Constants
const EXPECTED_DISCRIMINATOR = Buffer.from([0x69, 0x66, 0x18, 0x06, 0x31, 0x40, 0x28, 0x21]);


class BondingCurveState {
    constructor(data) {
        const offset = 8; // Skip discriminator
        this.virtualTokenReserves = BigInt(data.readBigUInt64LE(offset));
        this.virtualSolReserves = BigInt(data.readBigUInt64LE(offset + 8));
        this.realTokenReserves = BigInt(data.readBigUInt64LE(offset + 16));
        this.realSolReserves = BigInt(data.readBigUInt64LE(offset + 24));
        this.tokenTotalSupply = BigInt(data.readBigUInt64LE(offset + 32));
        this.complete = data[offset + 40] === 1;
    }
}

function getAssociatedBondingCurveAddress(mint, programId) {
    return PublicKey.findProgramAddressSync(
        [Buffer.from("bonding-curve"), mint.toBuffer()],
        programId
    );
}

async function getBondingCurveState(connection, curveAddress) {
    const accountInfo = await connection.getAccountInfo(curveAddress);
    if (!accountInfo || !accountInfo.data) {
        throw new Error("Invalid curve state: No data");
    }

    const data = accountInfo.data;

    // Dynamically extract discriminator
    const discriminator = data.slice(0, 8);
    console.log("Retrieved Discriminator:", discriminator.toString("hex"));

    return new BondingCurveState(data);
}


async function checkTokenStatus(mintAddress) {
    try {
        const mint = new PublicKey(mintAddress);

        // Get the associated bonding curve address
        const [bondingCurveAddress, bump] = getAssociatedBondingCurveAddress(mint, PUMP_PROGRAM);

        console.log("\nToken Status:");
        console.log("-".repeat(50));
        console.log(`Token Mint:              ${mint}`);
        console.log(`Associated Bonding Curve: ${bondingCurveAddress}`);
        console.log(`Bump Seed:               ${bump}`);
        console.log("-".repeat(50));

        // Check completion status
        console.log(RPC_ENDPOINT)
        const connection = new Connection(RPC_ENDPOINT, "confirmed");
        try {
            const curveState = await getBondingCurveState(connection, bondingCurveAddress);

            console.log("\nBonding Curve Status:");
            console.log("-".repeat(50));
            console.log(`Completion Status: ${curveState.complete ? 'Completed' : 'Not Completed'}`);
            if (curveState.complete) {
                console.log("\nNote: This bonding curve has completed and liquidity has been migrated to Raydium.");
            }
            console.log("-".repeat(50));
        } catch (error) {
            console.error(`\nError accessing bonding curve: ${error.message}`);
        }
    } catch (error) {
        console.error(`\nError: ${error.message}`);
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.error("Usage: node check_bonding_curve_status.js <mint_address>");
        process.exit(1);
    }

    const mintAddress = args[0];
    checkTokenStatus(mintAddress);
}
