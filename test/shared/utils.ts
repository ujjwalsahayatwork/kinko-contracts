import { MockProvider } from "ethereum-waffle";
import { BigNumber, Contract, Signer, constants } from "ethers";

import Launchpad from "../../build/Launchpad.json";

export function expandTo18Decimals(n: number): BigNumber {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(18));
}

export function expandToDecimals(n: number, power: number): BigNumber {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(power));
}

export const gasLimit = {
  gasLimit: 9999999,
};

export const burnAddress = "0x000000000000000000000000000000000000dEaD";

export const timeTravel = async (provider: MockProvider, seconds: number) => {
  await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
};

export const now = Math.floor(new Date().getTime() / 1000);

export const defaultParams = {
  amount: expandTo18Decimals(10000),
  hardcap: expandTo18Decimals(10),
  softcap: expandTo18Decimals(5),
  liquidity: BigNumber.from(500),
  listing: BigNumber.from(25),
  maxSpend: expandTo18Decimals(10),
  lockPeriod: BigNumber.from(31536000), // 1 year
  startTime: BigNumber.from(now),
  endTime: BigNumber.from(now + 7000),
};

// function to create a new launchpad
export const createLaunchpad = async (
  signer: Signer,
  generator: Contract,
  saleToken: Contract,
  baseToken: Contract,
  launchpadFactory: Contract,
  launchpadSettings: Contract,
  provider: MockProvider,
  amount?: number,
  hardcap?: number,
  softcap?: number,
  maxSpend?: number,
  liquidityPercent?: number,
  listingRate?: number,
  startTime?: number,
  endTime?: number,
  lockPeriod?: number
): Promise<Contract> => {
  // calculate params from inputs
  const initialAmount = amount
    ? expandTo18Decimals(amount)
    : defaultParams.amount;
  const initialHardcap = hardcap
    ? expandTo18Decimals(hardcap)
    : defaultParams.hardcap;

  // set desired params
  const params = {
    amount: initialAmount,
    hardcap: initialHardcap,
    softcap: softcap ? expandTo18Decimals(softcap) : defaultParams.softcap,
    liquidity: liquidityPercent
      ? BigNumber.from(liquidityPercent)
      : defaultParams.liquidity,
    listing: listingRate ?? defaultParams.listing,
    maxSpend: maxSpend ? expandTo18Decimals(maxSpend) : defaultParams.maxSpend,
    lockPeriod: lockPeriod
      ? BigNumber.from(lockPeriod)
      : defaultParams.lockPeriod,
    startTime: startTime ? BigNumber.from(startTime) : defaultParams.startTime,
    endTime: endTime ? BigNumber.from(endTime) : defaultParams.endTime,
  };

  // approve generator with sale token amount
  const saleTokenAmount = await generator.calculateAmountRequired(
    params.amount,
    params.listing,
    params.liquidity
  );

  await saleToken.connect(signer).approve(generator.address, saleTokenAmount);

  // format params for launchpad creation
  const launchpadParams = [];
  for (const [key, value] of Object.entries(params)) {
    launchpadParams.push(value);
  }

  //create launchpad
  const owner = await signer.getAddress();
  const creationFee = await launchpadSettings.getGlmrCreationFee();
  await generator.connect(signer).createLaunchpad(
    owner, // launchpad owner
    saleToken.address, // sale token
    baseToken.address, // base token
    constants.AddressZero, // referral
    launchpadParams,
    { ...gasLimit, value: creationFee }
  );

  // get contract instance of created launchpad
  const launchPadAddress = await launchpadFactory.launchpadAtIndex(0);
  return new Contract(
    launchPadAddress,
    JSON.stringify(Launchpad.abi),
    provider
  ).connect(signer);
};

// calculates the liquidity amount to lock into pool after sale
export const calcLiquidityAmounts = async (
  baseTokenAmount: BigNumber,
  saleTokenAmount: BigNumber,
  liquidityRate: number,
  listingRate: number,
  tokenFee: number
): Promise<{ saleAmount: BigNumber; baseAmount: BigNumber }> => {
  const saleAmountMinusFee = saleTokenAmount.mul(1000 - tokenFee).div(1000);
  const saleAmount = saleAmountMinusFee
    .mul(liquidityRate)
    .mul(100 - listingRate)
    .div(100000);

  const baseAmountMinusFee = baseTokenAmount.mul(1000 - tokenFee).div(1000);
  const baseAmount = baseAmountMinusFee.mul(liquidityRate).div(1000);
  return { saleAmount, baseAmount };
};
