export type CustomError =
  | InsufficientBalance
  | InitAccount
  | InvalidArguments
  | InvalidAccounts
  | ArithmeticError
  | StalePrice
  | InvalidOracle
  | DeppegedPair
  | WrongWithdrawFunction
  | NotEnoughParticipants
  | RandomnessSlotMismatch
  | InsufficientRandomness
  | RandomnessAlreadyRevealed
  | LotteryDidNotHappen
  | LotteryTimeIsnotUp
  | DeserializationError
  | DepegError
  | NegativeYieldError;

export class InsufficientBalance extends Error {
  static readonly code = 6000;
  readonly code = 6000;
  readonly name = "InsufficientBalance";
  readonly msg = "Insufficient balance";

  constructor(readonly logs?: string[]) {
    super("6000: Insufficient balance");
  }
}

export class InitAccount extends Error {
  static readonly code = 6001;
  readonly code = 6001;
  readonly name = "InitAccount";
  readonly msg = "Account is Initialized";

  constructor(readonly logs?: string[]) {
    super("6001: Account is Initialized");
  }
}

export class InvalidArguments extends Error {
  static readonly code = 6002;
  readonly code = 6002;
  readonly name = "InvalidArguments";
  readonly msg = "Invalid Argument Supplied To the Program";

  constructor(readonly logs?: string[]) {
    super("6002: Invalid Argument Supplied To the Program");
  }
}

export class InvalidAccounts extends Error {
  static readonly code = 6003;
  readonly code = 6003;
  readonly name = "InvalidAccounts";
  readonly msg = "Invalid Accounts Supplied To the Program";

  constructor(readonly logs?: string[]) {
    super("6003: Invalid Accounts Supplied To the Program");
  }
}

export class ArithmeticError extends Error {
  static readonly code = 6004;
  readonly code = 6004;
  readonly name = "ArithmeticError";
  readonly msg = "Arithmetic Error";

  constructor(readonly logs?: string[]) {
    super("6004: Arithmetic Error");
  }
}

export class StalePrice extends Error {
  static readonly code = 6005;
  readonly code = 6005;
  readonly name = "StalePrice";
  readonly msg =
    "Pyth Price is Stale or there was an error fetching the price.";

  constructor(readonly logs?: string[]) {
    super(
      "6005: Pyth Price is Stale or there was an error fetching the price."
    );
  }
}

export class InvalidOracle extends Error {
  static readonly code = 6006;
  readonly code = 6006;
  readonly name = "InvalidOracle";
  readonly msg = "Only SOL and INF are supported.";

  constructor(readonly logs?: string[]) {
    super("6006: Only SOL and INF are supported.");
  }
}

export class DeppegedPair extends Error {
  static readonly code = 6007;
  readonly code = 6007;
  readonly name = "DeppegedPair";
  readonly msg = "Pairs are deppeged.";

  constructor(readonly logs?: string[]) {
    super("6007: Pairs are deppeged.");
  }
}

export class WrongWithdrawFunction extends Error {
  static readonly code = 6008;
  readonly code = 6008;
  readonly name = "WrongWithdrawFunction";
  readonly msg = "Wrong Withdraw Function.";

  constructor(readonly logs?: string[]) {
    super("6008: Wrong Withdraw Function.");
  }
}

export class NotEnoughParticipants extends Error {
  static readonly code = 6009;
  readonly code = 6009;
  readonly name = "NotEnoughParticipants";
  readonly msg = "Not enough participants for lottery";

  constructor(readonly logs?: string[]) {
    super("6009: Not enough participants for lottery");
  }
}

export class RandomnessSlotMismatch extends Error {
  static readonly code = 6010;
  readonly code = 6010;
  readonly name = "RandomnessSlotMismatch";
  readonly msg = "Randomness slot mismatch";

  constructor(readonly logs?: string[]) {
    super("6010: Randomness slot mismatch");
  }
}

export class InsufficientRandomness extends Error {
  static readonly code = 6011;
  readonly code = 6011;
  readonly name = "InsufficientRandomness";
  readonly msg = "InsufficientRandomness";

  constructor(readonly logs?: string[]) {
    super("6011: InsufficientRandomness");
  }
}

export class RandomnessAlreadyRevealed extends Error {
  static readonly code = 6012;
  readonly code = 6012;
  readonly name = "RandomnessAlreadyRevealed";
  readonly msg = "This slot has been already used";

  constructor(readonly logs?: string[]) {
    super("6012: This slot has been already used");
  }
}

export class LotteryDidNotHappen extends Error {
  static readonly code = 6013;
  readonly code = 6013;
  readonly name = "LotteryDidNotHappen";
  readonly msg = "Lottery did not happen yet";

  constructor(readonly logs?: string[]) {
    super("6013: Lottery did not happen yet");
  }
}

export class LotteryTimeIsnotUp extends Error {
  static readonly code = 6014;
  readonly code = 6014;
  readonly name = "LotteryTimeIsnotUp";
  readonly msg = "Lottery is happening in future";

  constructor(readonly logs?: string[]) {
    super("6014: Lottery is happening in future");
  }
}

export class DeserializationError extends Error {
  static readonly code = 6015;
  readonly code = 6015;
  readonly name = "DeserializationError";
  readonly msg = "Deserialization Error";

  constructor(readonly logs?: string[]) {
    super("6015: Deserialization Error");
  }
}

export class DepegError extends Error {
  static readonly code = 6016;
  readonly code = 6016;
  readonly name = "DepegError";
  readonly msg = "INF to SOL pair are depegged";

  constructor(readonly logs?: string[]) {
    super("6016: INF to SOL pair are depegged");
  }
}

export class NegativeYieldError extends Error {
  static readonly code = 6017;
  readonly code = 6017;
  readonly name = "NegativeYieldError";
  readonly msg = "Lottery Yield can not be negative";

  constructor(readonly logs?: string[]) {
    super("6017: Lottery Yield can not be negative");
  }
}

export function fromCode(code: number, logs?: string[]): CustomError | null {
  switch (code) {
    case 6000:
      return new InsufficientBalance(logs);
    case 6001:
      return new InitAccount(logs);
    case 6002:
      return new InvalidArguments(logs);
    case 6003:
      return new InvalidAccounts(logs);
    case 6004:
      return new ArithmeticError(logs);
    case 6005:
      return new StalePrice(logs);
    case 6006:
      return new InvalidOracle(logs);
    case 6007:
      return new DeppegedPair(logs);
    case 6008:
      return new WrongWithdrawFunction(logs);
    case 6009:
      return new NotEnoughParticipants(logs);
    case 6010:
      return new RandomnessSlotMismatch(logs);
    case 6011:
      return new InsufficientRandomness(logs);
    case 6012:
      return new RandomnessAlreadyRevealed(logs);
    case 6013:
      return new LotteryDidNotHappen(logs);
    case 6014:
      return new LotteryTimeIsnotUp(logs);
    case 6015:
      return new DeserializationError(logs);
    case 6016:
      return new DepegError(logs);
    case 6017:
      return new NegativeYieldError(logs);
  }

  return null;
}
