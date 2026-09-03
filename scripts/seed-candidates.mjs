// Five demo candidates, for showing the Demand Radar working.
//
//   npm run seed:candidates            add them
//   npm run seed:candidates -- --clear  remove them again
//
// Every person here is INVENTED. No real candidate data is in this repo, and
// none should be: real candidates come in through Analyze Candidate, which
// writes to the same table.
//
// They are chosen to cover the market ALAC actually works, so the four result
// buckets all populate: a commercial lead, two engineers with different
// specialisms, a programs person, and one deliberately narrow candidate whose
// exact matches will be thin, which is what demonstrates the never-stop-at-zero
// rule rather than a happy path.

import { config } from "dotenv";
import pg from "pg";
import { levelOf } from "../src/lib/scoring/match.mjs";

config({ path: ".env.local" });

const ORG_SLUG = process.env.ALAC_ORG_SLUG ?? "alac";
const CLEAR = process.argv.includes("--clear");

// The tag that marks a row as demo data, so --clear can find them and a real
// candidate can never be removed by accident.
const TAG = "[demo]";

const PEOPLE = [
  {
    full_name: "Marcus Ellery",
    title: "Director of Business Development",
    company: "Meridian Defense Group",
    geography: "Arlington, Virginia",
    clearance: "TS/SCI",
    domains: "UAS, Navy, NAVSEA, loitering munitions, C2",
    comp_target: "$240,000",
    summary:
      "Twenty two years in defence capture and business development, the last nine "
      + "carrying Navy and Marine Corps portfolios. Owned NAVSEA and NAVAIR customer "
      + "relationships through three programme cycles, led capture on two competitive "
      + "UAS awards and one loitering munitions IDIQ. Built and ran a five person "
      + "capture team. Comfortable at flag officer level and in the room with primes. "
      + "Looking for a growth leadership seat at a company scaling past its first "
      + "programme of record.",
  },
  {
    full_name: "Priya Raghavan",
    title: "Principal GNC Engineer",
    company: "Northfield Aerospace",
    geography: "El Segundo, California",
    clearance: "Secret",
    domains: "GNC, flight software, propulsion, space systems, satellite",
    comp_target: "$265,000",
    summary:
      "Guidance, navigation and control lead across launch and on orbit systems. "
      + "Wrote and flight qualified the GNC stack for two smallsat buses and one upper "
      + "stage. Deep in estimation, six degree of freedom simulation and flight "
      + "software verification. Holds a doctorate in aerospace engineering. Has taken "
      + "three vehicles from paper to flight and wants a principal or chief engineer "
      + "seat where the vehicle is the product.",
  },
  {
    full_name: "Dane Kowalczyk",
    title: "Senior Manager, Manufacturing Engineering",
    company: "Ardent Industrial Systems",
    geography: "Huntsville, Alabama",
    clearance: null,
    domains: "additive manufacturing, robotics, production, quality",
    comp_target: "$185,000",
    summary:
      "Production and manufacturing engineering leader who scales first article "
      + "builds into rate. Stood up two additive manufacturing cells and a robotic "
      + "weld line, took one defence hardware programme from twelve units a year to "
      + "two hundred. Runs quality, supply chain qualification and the shop floor. "
      + "Wants to own manufacturing at a hardware company hitting its first serious "
      + "production ramp.",
  },
  {
    full_name: "Alicia Benhoff",
    title: "Director of Program Management",
    company: "Cutler Mission Systems",
    geography: "Colorado Springs, Colorado",
    clearance: "TS/SCI with polygraph",
    domains: "ISR, space systems, Space Force, C2, DoD",
    comp_target: "$225,000",
    summary:
      "Programme director for classified space and ISR work. Carried a portfolio of "
      + "four cost plus programmes worth ninety million a year, with earned value "
      + "reporting, subcontract management and customer briefings at the two star "
      + "level. Recovered two programmes that were behind on schedule and cost. "
      + "Wants a programmes leadership role at a company where the customer is the "
      + "Space Force or the intelligence community.",
  },
  {
    // Deliberately narrow: undersea autonomy is a small market, so this
    // candidate's exact matches will be thin and the implied demand and
    // strategic target buckets carry the screen. That is the demo.
    full_name: "Tomas Iversen",
    title: "Lead Engineer, Undersea Autonomy",
    company: "Halden Maritime",
    geography: "San Diego, California",
    clearance: "Secret",
    domains: "undersea, maritime, autonomy, submarine, ISR",
    comp_target: "$210,000",
    summary:
      "Autonomy engineer for uncrewed undersea vehicles. Built the behaviour and "
      + "mission planning stack for two UUV programmes, including acoustic "
      + "communications constrained autonomy and long endurance mission execution "
      + "without a comms link. Ten years in maritime robotics, five of them on Navy "
      + "programmes. A narrow specialism and a short list of companies that need it.",
  },
];

/** The same marketability score Analyze Candidate uses. */
function mpcScore(c) {
  let s = 40;
  s += levelOf(c.title ?? "").rank * 8;
  if (c.clearance) s += 15;
  s += Math.min(15, (c.domains ?? "").split(",").filter(Boolean).length * 5);
  if ((c.summary ?? "").length > 400) s += 5;
  return Math.max(0, Math.min(100, s));
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});

async function main() {
  await client.connect();
  const orgs = await client.query("select id from orgs where slug = $1", [ORG_SLUG]);
  if (orgs.rows.length === 0) throw new Error(`no org with slug ${ORG_SLUG}`);
  const orgId = orgs.rows[0].id;

  if (CLEAR) {
    const { rowCount } = await client.query(
      `delete from candidates where org_id = $1 and company like $2`,
      [orgId, `%${TAG}`],
    );
    console.log(`removed ${rowCount} demo candidates`);
    await client.end();
    return;
  }

  let added = 0;
  for (const p of PEOPLE) {
    const score = mpcScore(p);
    // Conflict-free by construction: the demo tag plus the name is unique, and
    // a rerun updates rather than duplicating.
    const existing = await client.query(
      `select id from candidates where org_id = $1 and full_name = $2 and company like $3`,
      [orgId, p.full_name, `%${TAG}`],
    );
    if (existing.rows[0]) {
      await client.query(
        `update candidates set title=$2, geography=$3, location=$3, clearance=$4,
                domains=$5, comp_target=$6, summary=$7, mpc_score=$8, updated_at=now()
          where id = $1`,
        [existing.rows[0].id, p.title, p.geography, p.clearance, p.domains, p.comp_target, p.summary, score],
      );
    } else {
      await client.query(
        `insert into candidates
           (org_id, full_name, title, company, geography, location, clearance,
            domains, comp_target, summary, mpc_score, active)
         values ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,true)`,
        [orgId, p.full_name, p.title, `${p.company} ${TAG}`, p.geography,
         p.clearance, p.domains, p.comp_target, p.summary, score],
      );
      added += 1;
    }
    console.log(`  ${String(score).padStart(3)}  ${p.full_name.padEnd(20)}${p.title}`);
  }

  console.log(`\n${added} added, ${PEOPLE.length - added} updated. Every one is invented.`);
  console.log("Remove them with: npm run seed:candidates -- --clear");
  await client.end();
}

main().catch(async (err) => {
  console.error(String(err?.message ?? err).slice(0, 300));
  await client.end().catch(() => {});
  process.exit(1);
});
