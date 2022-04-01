import { Framework } from "@vechain/connex-framework";
import { Driver, SimpleNet, SimpleWallet } from "@vechain/connex-driver";
import { IVEXCHANGEV2PAIR_ABI } from "./abi/IVexchangeV2Pair";
import { find } from 'lodash'
import { BigNumber, ethers } from "ethers";
import {formatEther} from "ethers/lib/utils";

const MAINNET_NODE_URL = "https://jp.mainnet-node.vexchange.io"
const VEED_VET_PAIR_ADDRESS = "0x3A778a7B141e846c53D03BA4c1899326eE0D0c14"
const PAIR_CREATED_BLOCK = 9559526
const MARCH_3_0000_UTC_BLOCK = 11574496
const MARCH_31_235950_UTC_BLOCK = 11825033
const LP_TOKEN_AMOUNT_THRESHOLD = BigNumber.from(53600).mul(ethers.constants.WeiPerEther)

async function Main()
{
    const lNet = new SimpleNet(MAINNET_NODE_URL);
    const lDriver = await Driver.connect(lNet);
    const lProvider = new Framework(lDriver);

    const lVeedVetPairContract = lProvider.thor.account(VEED_VET_PAIR_ADDRESS);
    const lTransferEventABI: object = find(IVEXCHANGEV2PAIR_ABI.abi, { name: "Transfer" });
    const lTransferEvent: Connex.Thor.Account.Event = lVeedVetPairContract.event(lTransferEventABI);

    const lTransferEventFilter: Connex.Thor.Filter<"event", Connex.Thor.Account.WithDecoded>
                            = lTransferEvent.filter([]).range({
                            unit: "block",
                            from: PAIR_CREATED_BLOCK,
                            to: MARCH_3_0000_UTC_BLOCK
                        })

    let lEnd: boolean = false
    let lOffset: number = 0;
    const lLimit: number = 256;
    const lAccountBalances: Map<string, BigNumber> = new Map();

    while (!lEnd)
    {
        const result: Connex.Thor.Filter.Row<"event", Connex.Thor.Account.WithDecoded>[] =
            await lTransferEventFilter.apply(lOffset, lLimit);

        for (const transaction of result)
        {
            const lSender = transaction.meta.txOrigin;

            if (!lAccountBalances.has(lSender))
            {
                lAccountBalances.set(lSender, ethers.constants.Zero);
            }

            const lPrevBal = lAccountBalances.get(lSender);
            if (lPrevBal !== undefined)
            {
                // liquidity provision operation
                if (transaction.decoded.from === ethers.constants.AddressZero)
                {
                    lAccountBalances.set(lSender, lPrevBal.add(transaction.decoded.value));
                }
                // liquidity removal operation
                else if (transaction.decoded.to === ethers.constants.AddressZero)
                {
                    lAccountBalances.set(lSender, lPrevBal.sub(transaction.decoded.value));
                }
                // intermediate transactions to the pair contract for burning, ignore
                else if (transaction.decoded.to === VEED_VET_PAIR_ADDRESS.toLowerCase() ||
                         transaction.decoded.from === VEED_VET_PAIR_ADDRESS.toLowerCase())
                {}
                // other transfers of the LP token, ignore
                else
                {}
            }
        }

        if (result.length === lLimit) lOffset += lLimit;
        else lEnd = true;
    }

    const lMar3Snapshot: Map<string, BigNumber>  = new Map();

    lAccountBalances.forEach((aBal, aWallet) => {
        if (aBal.gte(LP_TOKEN_AMOUNT_THRESHOLD))
        {
            lMar3Snapshot.set(aWallet, aBal)
        }
    })

    console.log("Accounts >= 53600 LP tokens as of 3 Mar 0000 UTC+0 ")
    lMar3Snapshot.forEach((aBal, aWallet) => {
        console.log(aWallet, formatEther(aBal.toString()))
    })
    console.log("Total number of wallets: ", lMar3Snapshot.size)

    const lTransferEventFilter31Mar: Connex.Thor.Filter<"event", Connex.Thor.Account.WithDecoded>
        = lTransferEvent.filter([]).range({
        unit: "block",
        from: MARCH_3_0000_UTC_BLOCK + 1,
        to: MARCH_31_235950_UTC_BLOCK
    })

    lEnd  = false
    lOffset  = 0;

    while (!lEnd)
    {
        const result: Connex.Thor.Filter.Row<"event", Connex.Thor.Account.WithDecoded>[] =
            await lTransferEventFilter31Mar.apply(lOffset, lLimit);

        for (const transaction of result)
        {
            const lSender = transaction.meta.txOrigin;

            // ignore events that don't concern the already shortlisted wallets
            if (!lMar3Snapshot.has(lSender))
            {
                continue;
            }

            const lPrevBal = lMar3Snapshot.get(lSender);
            if (lPrevBal !== undefined)
            {
                // liquidity provision operation
                if (transaction.decoded.from === ethers.constants.AddressZero)
                {
                    lMar3Snapshot.set(lSender, lPrevBal.add(transaction.decoded.value));
                }
                // liquidity removal operation
                else if (transaction.decoded.to === ethers.constants.AddressZero)
                {
                    lMar3Snapshot.set(lSender, lPrevBal.sub(transaction.decoded.value));
                }
                // intermediate transactions to the pair contract for burning, ignore
                else if (transaction.decoded.to === VEED_VET_PAIR_ADDRESS.toLowerCase() ||
                    transaction.decoded.from === VEED_VET_PAIR_ADDRESS.toLowerCase())
                {}
                // other transfers of the LP token, ignore
                else {}
            }
        }
        if (result.length === lLimit) lOffset += lLimit;
        else lEnd = true;
    }

    const lEligibleWallets: Map<string, BigNumber> = new Map();
    lMar3Snapshot.forEach((aBal, aWallet) => {
        if (aBal.gte(LP_TOKEN_AMOUNT_THRESHOLD))
        {
            lEligibleWallets.set(aWallet, aBal)
        }
    })

    console.log("Accounts >= 53600 LP tokens as of 31 Mar 235950 UTC+0 ")
    lEligibleWallets.forEach((aBal, aWallet) => {
        console.log(aWallet, formatEther(aBal.toString()))
    })
    console.log("Total number of wallets: ", lEligibleWallets.size)
}

Main()
