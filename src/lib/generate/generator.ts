/**
 * Top-level deterministic generator: spec in, full Dataset out.
 *
 * This is the boundary the README talks about. Nothing in this module or its
 * dependencies calls an LLM. Given a spec and a seed, the output is exact and
 * reproducible, balances reconcile, and every foreign key resolves.
 */

import type { Dataset, Institution } from "../domain/types";
import type { GenerationSpec } from "../domain/spec";
import { Rng } from "./rng";
import { syntheticRoutingNumber } from "./identity";
import { CITIES } from "./pools";
import { generateParties } from "./parties";
import { generateAccounts } from "./accounts";
import { generateTransactions } from "./transactions";

function makeInstitution(rng: Rng, spec: GenerationSpec): Institution {
  const city = rng.pick(CITIES);
  const name =
    spec.institutionName ??
    (spec.institutionType === "credit_union"
      ? `${city.city} ${rng.pick(["Community", "Federal", "Members", "Heritage"])} Credit Union`
      : `${city.city} ${rng.pick(["Community", "First", "Heritage", "Valley"])} Bank`);
  return {
    type: spec.institutionType,
    name,
    routingNumber: syntheticRoutingNumber(rng),
  };
}

export function generateDataset(spec: GenerationSpec): Dataset {
  const rng = new Rng(spec.seed);

  const institution = makeInstitution(rng, spec);
  const parties = generateParties(rng, spec);
  const accounts = generateAccounts(rng, spec, parties);
  const transactions = generateTransactions(rng, spec, parties, accounts);

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      seed: spec.seed,
      counts: {
        parties: parties.length,
        accounts: accounts.length,
        transactions: transactions.length,
      },
      spec,
    },
    institution,
    parties,
    accounts,
    transactions,
  };
}
