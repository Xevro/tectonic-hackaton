export type SituationTag = "existing_rule" | "no_existing_rule";

export type CandidateSituation = {
  id: string;
  rank: number;
  title: string;
  tag: SituationTag;
  cohortSize: number;
  medianLeadTimeDays: number | null;
};

export type SuppressedCohort = {
  id: string;
  title: string;
  cohortSize: number;
  protectionOnly: boolean;
};

export type EvalReport = {
  households: number;
  plantedPatterns: number;
  recovered: number;
  medianLeadTimeDays: number;
  candidateSituations: number;
  suppressedCohorts: number;
  candidates: CandidateSituation[];
  suppressed: SuppressedCohort[];
};

export type PipelineDot = {
  x: number;
  y: number;
  bent: boolean;
  cluster: number | null;
};

export type PipelineSample = {
  households: number;
  dots: PipelineDot[];
};

const FEATURES = [
  "salary",
  "accountant",
  "socialFund",
  "hospitalisation",
  "homeSavings",
  "childcare",
  "pension",
  "rentShift",
  "carePay",
  "partnerOut",
  "failedBills",
] as const;

type Feature = (typeof FEATURES)[number];
type Plant =
  | "stable"
  | "self_employment"
  | "first_home"
  | "new_child"
  | "retirement"
  | "relocation"
  | "separation"
  | "distress"
  | "care";

const PLANTS: Plant[] = [
  "self_employment",
  "first_home",
  "new_child",
  "retirement",
  "relocation",
  "separation",
  "distress",
  "care",
];

const COUNTS: Record<Plant, number> = {
  stable: 7050,
  self_employment: 700,
  first_home: 550,
  new_child: 400,
  retirement: 350,
  relocation: 300,
  separation: 250,
  distress: 220,
  care: 180,
};

const BASE_END = 15;
const BEND_MONTH = 20;
const RECENT_START = 20;
const RECENT_END = 23;
const MONTHS = 30;
const DAYS_PER_MONTH = 30;
const BEND_THRESHOLD = 0.45;

const TITLES: Record<Exclude<Plant, "stable">, string> = {
  self_employment: "Households preparing for a member to become self-employed",
  first_home: "Households preparing to buy a first home",
  new_child: "Households preparing for a child",
  retirement: "Households moving from a salary to a pension",
  relocation: "Households whose housing costs are changing",
  separation: "Separation",
  distress: "Financial distress",
  care: "Care for a relative",
};

const EXISTING_RULES = new Set<Plant>(["first_home"]);
const SUPPRESSED = new Set<Plant>(["separation", "distress", "care"]);

type Household = {
  plant: Plant;
  deviation: number[];
  score: number;
  leadDays: number | null;
};

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function featuresAt(plant: Plant, month: number, gap: number, rng: () => number) {
  const row = [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
  const bent = month >= BEND_MONTH;
  if (plant === "self_employment") {
    if (bent) {
      row[1] = 1;
      row[2] = 1;
    }
    if (month >= BEND_MONTH + gap) {
      row[0] = 0;
      row[3] = 0;
    }
  } else if (plant === "first_home") {
    if (bent) row[4] = 1;
  } else if (plant === "new_child") {
    if (bent) row[5] = 1;
  } else if (plant === "retirement") {
    if (bent) {
      row[0] = 0.35;
      row[6] = 0.7;
    }
  } else if (plant === "relocation") {
    if (bent) row[7] = 1;
  } else if (plant === "separation") {
    if (bent) row[9] = 1;
  } else if (plant === "distress") {
    if (bent) row[10] = 1;
  } else if (plant === "care") {
    if (bent) row[8] = 1;
  }
  for (let i = 0; i < row.length; i += 1) {
    row[i] = Math.max(0, row[i] + (rng() - 0.5) * 0.04);
  }
  return row;
}

function makeHousehold(plant: Plant, rng: () => number): Household {
  const gap = 3 + Math.floor(rng() * 3);
  const base = new Array(FEATURES.length).fill(0);
  const recent = new Array(FEATURES.length).fill(0);
  for (let month = 0; month < MONTHS; month += 1) {
    const row = featuresAt(plant, month, gap, rng);
    if (month < BASE_END) {
      for (let i = 0; i < row.length; i += 1) base[i] += row[i];
    }
    if (month >= RECENT_START && month < RECENT_END) {
      for (let i = 0; i < row.length; i += 1) recent[i] += row[i];
    }
  }
  const baseLen = BASE_END;
  const recentLen = RECENT_END - RECENT_START;
  const deviation = base.map((_, i) => recent[i] / recentLen - base[i] / baseLen);
  const score = Math.hypot(...deviation);
  return {
    plant,
    deviation,
    score,
    leadDays: plant === "self_employment" ? gap * DAYS_PER_MONTH : null,
  };
}

function dist2(a: number[], b: number[]) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

function kmeans(points: number[][], k: number, rng: () => number) {
  const centroids: number[][] = [];
  centroids.push(points[Math.floor(rng() * points.length)].slice());
  while (centroids.length < k) {
    const weights = points.map((point) => {
      let best = Infinity;
      for (const centroid of centroids) best = Math.min(best, dist2(point, centroid));
      return best;
    });
    let pick = rng() * weights.reduce((sum, weight) => sum + weight, 0);
    let index = points.length - 1;
    for (let i = 0; i < points.length; i += 1) {
      pick -= weights[i];
      if (pick <= 0) {
        index = i;
        break;
      }
    }
    centroids.push(points[index].slice());
  }

  const assign = new Array<number>(points.length).fill(0);
  for (let iter = 0; iter < 40; iter += 1) {
    for (let p = 0; p < points.length; p += 1) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c += 1) {
        const d = dist2(points[p], centroids[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assign[p] = best;
    }
    for (let c = 0; c < centroids.length; c += 1) {
      const members = points.filter((_, i) => assign[i] === c);
      if (members.length === 0) {
        centroids[c] = points[Math.floor(rng() * points.length)].slice();
        continue;
      }
      centroids[c] = FEATURES.map(
        (_, feature) => members.reduce((sum, row) => sum + row[feature], 0) / members.length,
      );
    }
  }
  return { assign, centroids };
}

function nameCentroid(centroid: number[]): Exclude<Plant, "stable"> | null {
  const value = (feature: Feature) => centroid[FEATURES.indexOf(feature)];
  if (value("partnerOut") > 0.35) return "separation";
  if (value("failedBills") > 0.35) return "distress";
  if (value("carePay") > 0.35) return "care";
  if (value("accountant") > 0.35 && value("socialFund") > 0.35) return "self_employment";
  if (value("homeSavings") > 0.2) return "first_home";
  if (value("childcare") > 0.35) return "new_child";
  if (value("pension") > 0.35) return "retirement";
  if (value("rentShift") > 0.35) return "relocation";
  return null;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  if (sorted.length % 2 === 0) return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return sorted[mid];
}

function homePoint(rng: () => number) {
  const angle = rng() * Math.PI * 2;
  const radius = Math.sqrt(rng()) * 0.22;
  return { x: 0.5 + Math.cos(angle) * radius, y: 0.5 + Math.sin(angle) * radius };
}

export function evaluate(seed = 141): { report: EvalReport; pipeline: PipelineSample } {
  const rng = mulberry32(seed);
  const households: Household[] = [];
  (Object.keys(COUNTS) as Plant[]).forEach((plant) => {
    for (let i = 0; i < COUNTS[plant]; i += 1) households.push(makeHousehold(plant, rng));
  });

  const bent = households.filter((household) => household.score >= BEND_THRESHOLD);
  const { assign, centroids } = kmeans(
    bent.map((household) => household.deviation),
    PLANTS.length,
    rng,
  );

  const clusters = centroids.map((centroid, index) => {
    const members = bent.filter((_, member) => assign[member] === index);
    const named = nameCentroid(centroid);
    return { index, named, members };
  });

  const recovered = new Set<Plant>();
  PLANTS.forEach((plant) => {
    const planted = households.filter((household) => household.plant === plant).length;
    const best = clusters.reduce(
      (winner, cluster) => {
        const hits = cluster.members.filter((member) => member.plant === plant).length;
        return hits > winner.hits ? { hits, size: cluster.members.length } : winner;
      },
      { hits: 0, size: 0 },
    );
    if (best.size > 0 && best.hits / best.size >= 0.5 && best.hits / planted >= 0.5) {
      recovered.add(plant);
    }
  });

  const byName = new Map<Exclude<Plant, "stable">, (typeof clusters)[number]>();
  clusters.forEach((cluster) => {
    if (!cluster.named || cluster.members.length < 40) return;
    const current = byName.get(cluster.named);
    if (!current || cluster.members.length > current.members.length) byName.set(cluster.named, cluster);
  });

  const candidates: CandidateSituation[] = [];
  const suppressed: SuppressedCohort[] = [];
  byName.forEach((cluster, name) => {
    const leads = cluster.members
      .map((member) => member.leadDays)
      .filter((days): days is number => days !== null);
    if (SUPPRESSED.has(name)) {
      suppressed.push({
        id: name,
        title: TITLES[name],
        cohortSize: cluster.members.length,
        protectionOnly: name === "care",
      });
      return;
    }
    candidates.push({
      id: name,
      rank: 0,
      title: TITLES[name],
      tag: EXISTING_RULES.has(name) ? "existing_rule" : "no_existing_rule",
      cohortSize: cluster.members.length,
      medianLeadTimeDays: leads.length ? median(leads) : null,
    });
  });

  candidates.sort((a, b) => b.cohortSize - a.cohortSize);
  candidates.forEach((candidate, index) => {
    candidate.rank = index + 1;
  });
  const suppressedOrder = ["separation", "distress", "care"];
  suppressed.sort(
    (a, b) => suppressedOrder.indexOf(a.id) - suppressedOrder.indexOf(b.id),
  );

  const selfEmployment = candidates.find((candidate) => candidate.id === "self_employment");
  const report: EvalReport = {
    households: households.length,
    plantedPatterns: PLANTS.length,
    recovered: recovered.size,
    medianLeadTimeDays: selfEmployment?.medianLeadTimeDays ?? 0,
    candidateSituations: candidates.length,
    suppressedCohorts: suppressed.length,
    candidates,
    suppressed,
  };

  const clusterAnchor = new Map<number, { x: number; y: number }>();
  clusters.forEach((cluster, order) => {
    const angle = (order / clusters.length) * Math.PI * 2 - Math.PI / 2;
    clusterAnchor.set(cluster.index, {
      x: 0.5 + Math.cos(angle) * 0.34,
      y: 0.5 + Math.sin(angle) * 0.34,
    });
  });

  const dots: PipelineDot[] = [];
  const unbent = households.filter((household) => household.score < BEND_THRESHOLD);
  for (let i = 0; i < 520 && i < unbent.length; i += 1) {
    const point = homePoint(rng);
    dots.push({ ...point, bent: false, cluster: null });
  }
  clusters.forEach((cluster) => {
    const anchor = clusterAnchor.get(cluster.index);
    if (!anchor) return;
    const sample = cluster.members.slice(0, 36);
    sample.forEach(() => {
      const point = homePoint(rng);
      dots.push({
        x: point.x,
        y: point.y,
        bent: true,
        cluster: cluster.index,
      });
    });
  });

  return { report, pipeline: { households: households.length, dots } };
}
