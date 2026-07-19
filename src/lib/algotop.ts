export type Difficulty = 1 | 2 | 3;
export type MasteryRating = 0 | 1 | 2 | 3;
export type StatusFilter = "" | "unrated" | "rating-1" | "rating-2" | "rating-3";
export type CompletionFilter = "" | "done" | "todo";

export type Filters = {
  page: number;
  search: string;
  company: string;
  department: string;
  job: string;
  level: string;
  tag: string;
  completion: CompletionFilter;
  status: StatusFilter;
  ordering: string;
};

type QuestionEntity = {
  id: number;
  displayId: string;
  title: string;
  level: Difficulty;
  slug: string;
  expandedLink: boolean;
};

type RankingItem = {
  questionId: number;
  frequency: number;
  time: string;
};

type LocalAlgoTopData = {
  generatedAt: string;
  source: {
    pageSize: number;
  };
  taxonomies: {
    companies: Company[];
    departments: Department[];
    jobs: Job[];
    tags: Tag[];
  };
  questions: Record<string, QuestionEntity>;
  indexes: {
    overall: RankingItem[];
    companies: Record<string, RankingItem[]>;
    departments: Record<string, RankingItem[]>;
    jobs: Record<string, RankingItem[]>;
    tags: Record<string, RankingItem[]>;
  };
};

export type Question = {
  id: number;
  displayId: string;
  title: string;
  level: Difficulty;
  date: string;
  frequency: number;
  rate: MasteryRating;
  done: boolean;
  slug: string;
  expandedLink: boolean;
};

export type QuestionProgress = {
  done?: boolean;
  mastery?: MasteryRating;
  updatedAt?: string;
};

export type UserProgress = Record<string, QuestionProgress>;

export type QuestionResponse = {
  count: number;
  items: Question[];
};

export type Company = {
  id: number;
  name: string;
  is_new: boolean;
};

export type Department = {
  id: number;
  name: string;
  company: number;
};

export type Job = {
  id: number;
  name: string;
  priority: number;
};

export type Tag = {
  id: number;
  name: string;
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  1: "容易",
  2: "中等",
  3: "困难",
};

let localDataPromise: Promise<LocalAlgoTopData> | undefined;

async function loadLocalData() {
  if (localDataPromise) return localDataPromise;

  localDataPromise = fetch("/data/codetop.json").then((response) => {
    if (!response.ok) {
      throw new Error(`Local data failed: ${response.status}`);
    }

    return response.json() as Promise<LocalAlgoTopData>;
  });

  return localDataPromise;
}

function normalizeQuestion(
  entity: QuestionEntity,
  ranking: RankingItem,
  progress: UserProgress,
): Question {
  const itemProgress = progress[String(entity.id)] ?? {};

  return {
    id: entity.id,
    displayId: entity.displayId,
    title: entity.title,
    level: entity.level,
    date: ranking.time.slice(0, 10),
    frequency: ranking.frequency,
    rate: itemProgress.mastery ?? 0,
    done: Boolean(itemProgress.done),
    slug: entity.slug,
    expandedLink: entity.expandedLink,
  };
}

function rankingForFilters(data: LocalAlgoTopData, filters: Filters) {
  if (filters.department) return data.indexes.departments[filters.department] ?? [];
  if (filters.company) return data.indexes.companies[filters.company] ?? [];
  if (filters.job) return data.indexes.jobs[filters.job] ?? [];
  if (filters.tag) return data.indexes.tags[filters.tag] ?? [];
  return data.indexes.overall;
}

function membershipSetsForFilters(data: LocalAlgoTopData, filters: Filters) {
  const sets: Array<Set<number>> = [];

  if (filters.company) {
    sets.push(
      new Set((data.indexes.companies[filters.company] ?? []).map((item) => item.questionId)),
    );
  }
  if (filters.department) {
    sets.push(
      new Set(
        (data.indexes.departments[filters.department] ?? []).map((item) => item.questionId),
      ),
    );
  }
  if (filters.job) {
    sets.push(new Set((data.indexes.jobs[filters.job] ?? []).map((item) => item.questionId)));
  }
  if (filters.tag) {
    sets.push(new Set((data.indexes.tags[filters.tag] ?? []).map((item) => item.questionId)));
  }

  return sets;
}

function compareDisplayId(a: Question, b: Question) {
  return a.displayId.localeCompare(b.displayId, "zh-CN", {
    numeric: true,
    sensitivity: "base",
  });
}

function sortQuestions(items: Question[], ordering: string) {
  const descending = ordering.startsWith("-");
  const field = ordering.replace("-", "");
  const direction = descending ? -1 : 1;

  return [...items].sort((a, b) => {
    if (field === "time") return a.date.localeCompare(b.date) * direction;
    if (field === "leetcode") return compareDisplayId(a, b) * direction;
    return (a.frequency - b.frequency) * direction;
  });
}

export async function fetchQuestions(
  filters: Filters,
  progress: UserProgress = {},
): Promise<QuestionResponse> {
  const data = await loadLocalData();
  const search = filters.search.trim().replace(".", "").toLocaleLowerCase();
  const membershipSets = membershipSetsForFilters(data, filters);

  const filteredItems = rankingForFilters(data, filters)
    .map((ranking) => {
      const entity = data.questions[String(ranking.questionId)];
      return entity ? normalizeQuestion(entity, ranking, progress) : null;
    })
    .filter((item): item is Question => Boolean(item))
    .filter((item) => {
      if (membershipSets.some((set) => !set.has(item.id))) return false;
      if (filters.level && item.level !== Number(filters.level)) return false;
      if (filters.completion === "done" && !item.done) return false;
      if (filters.completion === "todo" && item.done) return false;
      if (filters.status === "unrated" && item.rate !== 0) return false;
      if (filters.status === "rating-1" && item.rate !== 1) return false;
      if (filters.status === "rating-2" && item.rate !== 2) return false;
      if (filters.status === "rating-3" && item.rate !== 3) return false;
      if (!search) return true;

      const haystack =
        `${item.displayId} ${item.title} ${item.id}`.replace(".", "").toLocaleLowerCase();
      return haystack.includes(search);
    });

  const sortedItems = sortQuestions(filteredItems, filters.ordering);
  const pageStart = (filters.page - 1) * data.source.pageSize;

  return {
    count: sortedItems.length,
    items: sortedItems.slice(pageStart, pageStart + data.source.pageSize),
  };
}

export async function fetchCompanies() {
  return (await loadLocalData()).taxonomies.companies;
}

export async function fetchDepartments() {
  return (await loadLocalData()).taxonomies.departments;
}

export async function fetchJobs() {
  return (await loadLocalData()).taxonomies.jobs;
}

export async function fetchTags() {
  return (await loadLocalData()).taxonomies.tags;
}

export async function fetchQuestionsByIds(
  ids: Array<number | string>,
  progress: UserProgress = {},
) {
  const data = await loadLocalData();
  const overallRankingById = new Map(
    data.indexes.overall.map((ranking) => [String(ranking.questionId), ranking]),
  );

  return ids
    .map((id) => {
      const key = String(id);
      const entity = data.questions[key];
      if (!entity) return null;

      return normalizeQuestion(
        entity,
        overallRankingById.get(key) ?? {
          questionId: entity.id,
          frequency: 0,
          time: data.generatedAt,
        },
        progress,
      );
    })
    .filter((question): question is Question => Boolean(question));
}

export function buildQuestionUrl(question: Question) {
  if (question.expandedLink) return question.slug;
  return `https://leetcode.cn/problems/${question.slug}`;
}
