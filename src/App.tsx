import { keepPreviousData } from '@tanstack/react-query'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  RotateCw,
  Search,
  Star,
  X,
} from 'lucide-react'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { AccountMenu } from './components/AccountMenu'
import { LoginDialog } from './components/LoginDialog'
import { NoteListDialog } from './components/NoteListDialog'
import { ProfileDialog } from './components/ProfileDialog'
import { useAlgoTopQuery } from './hooks/useAlgoTopQuery'
import { useDebouncedValue } from './hooks/useDebouncedValue'
import {
  clearGithubOAuthCallbackUrl,
  completeGithubOAuthLogin,
  DEFAULT_LOCAL_PROFILE,
  getGithubOAuthConfig,
  readStoredLocalProfile,
  readStoredGithubToken,
  readStoredGithubUser,
  startGithubOAuthLogin,
  type GithubUser,
  type LocalProfile,
  writeStoredLocalProfile,
  writeStoredGithubToken,
  writeStoredGithubUser,
} from './lib/account'
import {
  buildQuestionUrl,
  type CompletionFilter,
  DIFFICULTY_LABEL,
  type Filters,
  fetchCompanies,
  fetchDepartments,
  fetchJobs,
  fetchQuestions,
  fetchQuestionsByIds,
  fetchTags,
  type MasteryRating,
  type Question,
  type StatusFilter,
  type UserProgress,
} from './lib/algotop'
import { downloadTextFile, formatDateStamp } from './lib/export'
import {
  createSyncPayload,
  pullAlgoTopGist,
  pushAlgoTopGist,
  readStoredGistSyncMeta,
  type AlgoTopSyncPayload,
  type GistSyncMeta,
  writeStoredGistSyncMeta,
} from './lib/gistSync'
import {
  hasQuestionNote,
  isDefaultNoteContent,
  makeAllNotesMarkdown,
  makeDefaultNoteContent,
  makeNoteFilename,
  makeNoteMarkdown,
  readStoredNotes,
  type UserNotes,
  writeStoredNotes,
} from './lib/notes'

const PAGE_SIZE = 20
const EMPTY_QUESTIONS: Question[] = []
const PROGRESS_STORAGE_KEY = 'algotop:user-progress:v1'
const THEME_STORAGE_KEY = 'algotop:theme'
const FILTER_STORAGE_KEY = 'algotop:filters:v1'
const ACTIVITY_DAY_COUNT = 112
const NoteEditorDialog = lazy(() =>
  import('./components/NoteEditorDialog').then((module) => ({
    default: module.NoteEditorDialog,
  })),
)

const initialFilters: Filters = {
  page: 1,
  search: '',
  company: '',
  department: '',
  job: '',
  level: '',
  tag: '',
  completion: '',
  status: '',
  ordering: '-frequency',
}

const ORDERING_LABELS: Record<string, string> = {
  '-frequency': '频度高到低',
  frequency: '频度低到高',
  '-time': '最近考察',
  time: '最早考察',
  '-leetcode': '题号大到小',
  leetcode: '题号小到大',
}

const STATUS_LABELS: Record<Exclude<StatusFilter, ''>, string> = {
  unrated: '未标注',
  'rating-1': '一星',
  'rating-2': '二星',
  'rating-3': '三星',
}

const COMPLETION_LABELS: Record<Exclude<CompletionFilter, ''>, string> = {
  done: '已做',
  todo: '未做',
}

type PersistedFilters = Pick<
  Filters,
  | 'company'
  | 'department'
  | 'job'
  | 'level'
  | 'tag'
  | 'completion'
  | 'status'
  | 'ordering'
>
type Theme = 'light' | 'dark'
type ThemePreference = Theme | 'system'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeImportedLocalProfile(value: unknown): LocalProfile | undefined {
  if (!isRecord(value)) return undefined

  return {
    name: typeof value.name === 'string' ? value.name : DEFAULT_LOCAL_PROFILE.name,
    avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
  }
}

function normalizeImportedFilters(value: unknown): Filters {
  if (!isRecord(value)) return initialFilters

  const status =
    value.status === 'unrated' ||
    value.status === 'rating-1' ||
    value.status === 'rating-2' ||
    value.status === 'rating-3'
      ? value.status
      : ''
  const completion =
    value.completion === 'done' || value.completion === 'todo'
      ? value.completion
      : ''
  const level =
    value.level === '1' || value.level === '2' || value.level === '3'
      ? value.level
      : ''
  const ordering =
    typeof value.ordering === 'string' && ORDERING_LABELS[value.ordering]
      ? value.ordering
      : initialFilters.ordering

  return {
    ...initialFilters,
    company: typeof value.company === 'string' ? value.company : '',
    department: typeof value.department === 'string' ? value.department : '',
    job: typeof value.job === 'string' ? value.job : '',
    level,
    tag: typeof value.tag === 'string' ? value.tag : '',
    completion,
    status,
    ordering,
    page: 1,
    search: typeof value.search === 'string' ? value.search : '',
  }
}

function normalizeImportedProgress(value: unknown): UserProgress {
  if (!isRecord(value)) return {}

  return Object.entries(value).reduce<UserProgress>((items, [id, rawItem]) => {
    if (!isRecord(rawItem)) return items

    const mastery =
      rawItem.mastery === 1 || rawItem.mastery === 2 || rawItem.mastery === 3
        ? rawItem.mastery
        : undefined
    const done = rawItem.done === true
    if (!done && !mastery) return items

    items[id] = {
      ...(done ? { done } : {}),
      ...(mastery ? { mastery } : {}),
      ...(typeof rawItem.updatedAt === 'string'
        ? { updatedAt: rawItem.updatedAt }
        : {}),
    }

    return items
  }, {})
}

function normalizeImportedNotes(
  value: unknown,
  fallbackUpdatedAt: string,
): UserNotes {
  if (!isRecord(value)) return {}

  return Object.entries(value).reduce<UserNotes>((items, [id, rawNote]) => {
    if (!isRecord(rawNote) || typeof rawNote.content !== 'string') return items

    const content = rawNote.content.trim()
    if (!content) return items

    items[id] = {
      content: rawNote.content,
      updatedAt:
        typeof rawNote.updatedAt === 'string'
          ? rawNote.updatedAt
          : fallbackUpdatedAt,
    }

    return items
  }, {})
}

function normalizeThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
    ? value
    : 'system'
}

function normalizeSyncPayload(value: unknown): AlgoTopSyncPayload {
  if (!isRecord(value)) throw new Error('导入失败')

  const preferences = isRecord(value.preferences) ? value.preferences : {}
  const exportedAt =
    typeof value.exportedAt === 'string'
      ? value.exportedAt
      : new Date().toISOString()

  return {
    schemaVersion: 1,
    app: 'AlgoTop',
    exportedAt,
    user: undefined,
    localProfile: normalizeImportedLocalProfile(value.localProfile),
    progress: normalizeImportedProgress(value.progress),
    notes: normalizeImportedNotes(value.notes, exportedAt),
    preferences: {
      filters: normalizeImportedFilters(preferences.filters),
      theme: normalizeThemePreference(preferences.theme),
    },
  }
}

function compareUserPayload(payload: AlgoTopSyncPayload) {
  const sortRecord = <T,>(record: Record<string, T> = {}) =>
    Object.fromEntries(
      Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
    )
  const profile = payload.localProfile ?? DEFAULT_LOCAL_PROFILE

  return JSON.stringify({
    progress: sortRecord(payload.progress),
    notes: sortRecord(payload.notes),
    localProfile: {
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    },
  })
}

function hasUserPayloadData(payload: AlgoTopSyncPayload) {
  const profile = payload.localProfile

  return (
    Object.keys(payload.progress ?? {}).length > 0 ||
    Object.keys(payload.notes ?? {}).length > 0 ||
    Boolean(
      profile &&
        (profile.name !== DEFAULT_LOCAL_PROFILE.name || profile.avatarUrl),
    )
  )
}

function hasUrlFilterParams(params: URLSearchParams) {
  return [
    'page',
    'search',
    'company',
    'department',
    'job',
    'level',
    'tag',
    'completion',
    'status',
    'ordering',
  ].some((key) => params.has(key))
}

function readStoredFilters(): Partial<PersistedFilters> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as Record<string, unknown>
    const next: Partial<PersistedFilters> = {}

    if (typeof parsed.company === 'string') next.company = parsed.company
    if (typeof parsed.department === 'string')
      next.department = parsed.department
    if (typeof parsed.job === 'string') next.job = parsed.job
    if (typeof parsed.tag === 'string') next.tag = parsed.tag
    if (parsed.level === '1' || parsed.level === '2' || parsed.level === '3') {
      next.level = parsed.level
    }
    if (parsed.completion === 'done' || parsed.completion === 'todo') {
      next.completion = parsed.completion
    }
    if (
      parsed.status === 'unrated' ||
      parsed.status === 'rating-1' ||
      parsed.status === 'rating-2' ||
      parsed.status === 'rating-3'
    ) {
      next.status = parsed.status
    }
    if (
      typeof parsed.ordering === 'string' &&
      ORDERING_LABELS[parsed.ordering]
    ) {
      next.ordering = parsed.ordering
    }
    if (!next.company) {
      delete next.department
    }

    return next
  } catch {
    return {}
  }
}

function readInitialFilters(): Filters {
  if (typeof window === 'undefined') return initialFilters

  const params = new URLSearchParams(window.location.search)
  const next = { ...initialFilters }
  const page = Number(params.get('page'))
  const status = params.get('status')
  const completion = params.get('completion')
  const ordering = params.get('ordering')

  if (!hasUrlFilterParams(params)) {
    return { ...next, ...readStoredFilters(), page: 1, search: '' }
  }

  next.search = params.get('search') ?? ''
  next.company = params.get('company') ?? ''
  next.department = params.get('department') ?? ''
  next.job = params.get('job') ?? ''
  next.level = params.get('level') ?? ''
  next.tag = params.get('tag') ?? ''
  next.page = Number.isFinite(page) && page > 0 ? page : 1

  if (status === 'done') {
    next.completion = 'done'
  } else if (status === 'todo') {
    next.completion = 'todo'
  } else if (
    status === 'unrated' ||
    status === 'rating-1' ||
    status === 'rating-2' ||
    status === 'rating-3'
  ) {
    next.status = status
  }
  if (completion === 'done' || completion === 'todo') {
    next.completion = completion
  }
  if (ordering && ORDERING_LABELS[ordering]) {
    next.ordering = ordering
  }

  return next
}

function syncFiltersToUrl(filters: Filters) {
  if (typeof window === 'undefined') return

  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (key === 'page' && value === 1) return
    if (key === 'ordering' && value === '-frequency') return
    if (!value) return
    params.set(key, String(value))
  })

  const query = params.toString()
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
  window.history.replaceState(null, '', nextUrl)
}

function syncFiltersToStorage(filters: Filters) {
  if (typeof window === 'undefined') return

  const persisted: Partial<PersistedFilters> = {
    company: filters.company || undefined,
    department: filters.department || undefined,
    job: filters.job || undefined,
    level: filters.level || undefined,
    tag: filters.tag || undefined,
    completion: filters.completion || undefined,
    status: filters.status || undefined,
    ordering:
      filters.ordering === initialFilters.ordering
        ? undefined
        : filters.ordering,
  }

  if (Object.values(persisted).some(Boolean)) {
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(persisted))
  } else {
    window.localStorage.removeItem(FILTER_STORAGE_KEY)
  }
}

function readStoredProgress(): UserProgress {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as Record<
      string,
      { mastery?: number; done?: boolean; updatedAt?: unknown }
    >
    return Object.entries(parsed).reduce<UserProgress>((items, [id, item]) => {
      const mastery = item.mastery ?? 0
      const done = Boolean(item.done)
      const next: UserProgress[string] = {}

      if (mastery === 1 || mastery === 2 || mastery === 3) {
        next.mastery = mastery
      }
      if (done) {
        next.done = done
      }
      if (!next.done && !next.mastery) return items

      if (typeof item.updatedAt === 'string') {
        next.updatedAt = item.updatedAt
      }

      items[id] = next

      return items
    }, {})
  } catch {
    return {}
  }
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

function buildActivityDays(progress: UserProgress, notes: UserNotes) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const counts = new Map<string, number>()
  for (let index = ACTIVITY_DAY_COUNT - 1; index >= 0; index -= 1) {
    const day = new Date(today)
    day.setDate(today.getDate() - index)
    counts.set(formatDateKey(day), 0)
  }

  const addActivity = (value?: string) => {
    if (!value) return

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return

    const key = formatDateKey(date)
    if (!counts.has(key)) return

    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  Object.values(progress).forEach((item) => addActivity(item.updatedAt))
  Object.values(notes).forEach((note) => addActivity(note.updatedAt))

  return Array.from(counts, ([date, count]) => ({ date, count }))
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light'

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function readInitialThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'light'

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored

  return 'system'
}

function MasteryStars({
  question,
  onChange,
}: {
  question: Question
  onChange: (id: number, mastery: MasteryRating) => void
}) {
  const [previewRating, setPreviewRating] = useState<MasteryRating | null>(null)
  const activeRating = previewRating ?? question.rate
  const isPreviewing = previewRating !== null

  return (
    <div
      className={`mastery-stars ${isPreviewing ? 'is-previewing' : ''}`}
      aria-label={`掌握程度 ${question.rate} 星`}
      onMouseLeave={() => setPreviewRating(null)}
    >
      {([1, 2, 3] as const).map((rating) => {
        const isSaved = question.rate >= rating
        const isActive = activeRating >= rating
        const isPreview = isPreviewing && activeRating >= rating
        const nextRating = question.rate === rating ? 0 : rating

        return (
          <button
            className={[
              'mastery-star',
              isActive ? 'is-active' : '',
              isSaved ? 'is-saved' : '',
              isPreview ? 'is-preview' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            type='button'
            key={rating}
            onMouseEnter={() => setPreviewRating(rating)}
            onFocus={() => setPreviewRating(rating)}
            onBlur={() => setPreviewRating(null)}
            onClick={() => {
              setPreviewRating(null)
              onChange(question.id, nextRating)
            }}
            aria-label={
              question.rate === rating ? '清空掌握程度' : `标记 ${rating} 星`
            }
            aria-pressed={isSaved}
            title={question.rate === rating ? '清空掌握程度' : `${rating} 星`}
          >
            <Star size={15} strokeWidth={1.7} />
          </button>
        )
      })}
    </div>
  )
}

export function App() {
  const [filters, setFilters] = useState<Filters>(() => readInitialFilters())
  const [progress, setProgress] = useState<UserProgress>(() =>
    readStoredProgress(),
  )
  const [notes, setNotes] = useState<UserNotes>(() => readStoredNotes())
  const [localProfile, setLocalProfile] = useState<LocalProfile>(() =>
    readStoredLocalProfile(),
  )
  const [githubUser, setGithubUser] = useState<GithubUser | null>(() =>
    readStoredGithubUser(),
  )
  const [githubToken, setGithubToken] = useState(() => readStoredGithubToken())
  const [gistSyncMeta, setGistSyncMeta] = useState<GistSyncMeta>(() =>
    readStoredGistSyncMeta(),
  )
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    readInitialThemePreference(),
  )
  const [systemTheme, setSystemTheme] = useState<Theme>(() => getSystemTheme())
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false)
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false)
  const [isNoteListOpen, setIsNoteListOpen] = useState(false)
  const [githubLoginError, setGithubLoginError] = useState('')
  const [isGithubLoginLoading, setIsGithubLoginLoading] = useState(false)
  const [syncMessage, setSyncMessage] = useState(
    gistSyncMeta.lastSyncedAt ? '已连接 Gist' : '',
  )
  const [isGistSyncing, setIsGistSyncing] = useState(false)
  const [activeNoteQuestion, setActiveNoteQuestion] = useState<Question | null>(
    null,
  )
  const [activeNoteDraft, setActiveNoteDraft] = useState('')
  const theme = themePreference === 'system' ? systemTheme : themePreference
  const githubOAuthConfig = useMemo(() => getGithubOAuthConfig(), [])
  const debouncedSearch = useDebouncedValue(filters.search, 350)
  const progressKey = useMemo(() => JSON.stringify(progress), [progress])
  const queryFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [debouncedSearch, filters],
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    if (themePreference === 'system') {
      window.localStorage.removeItem(THEME_STORAGE_KEY)
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, themePreference)
    }
  }, [themePreference])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light')
    }

    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    const callback = new URLSearchParams(window.location.search)
    if (!callback.has('code') && !callback.has('error')) return

    if (!githubOAuthConfig) {
      setGithubLoginError('GitHub OAuth 登录未配置')
      setIsLoginDialogOpen(true)
      clearGithubOAuthCallbackUrl()
      return
    }

    let isMounted = true
    setIsGithubLoginLoading(true)
    setGithubLoginError('')

    completeGithubOAuthLogin(githubOAuthConfig)
      .then((result) => {
        if (!isMounted || !result) return
        setGithubUser(result.user)
        setGithubToken(result.token)
        setIsLoginDialogOpen(false)
        setIsProfileDialogOpen(true)
        setSyncMessage('可同步 Gist')
      })
      .catch((error) => {
        if (!isMounted) return
        setGithubLoginError(error instanceof Error ? error.message : 'GitHub 登录失败')
        setIsLoginDialogOpen(true)
      })
      .finally(() => {
        if (!isMounted) return
        setIsGithubLoginLoading(false)
        clearGithubOAuthCallbackUrl()
      })

    return () => {
      isMounted = false
    }
  }, [githubOAuthConfig])

  useEffect(() => {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress))
  }, [progress])

  useEffect(() => {
    writeStoredNotes(notes)
  }, [notes])

  useEffect(() => {
    writeStoredLocalProfile(localProfile)
  }, [localProfile])

  useEffect(() => {
    writeStoredGithubUser(githubUser)
  }, [githubUser])

  useEffect(() => {
    writeStoredGithubToken(githubToken)
  }, [githubToken])

  useEffect(() => {
    writeStoredGistSyncMeta(gistSyncMeta)
  }, [gistSyncMeta])

  useEffect(() => {
    syncFiltersToUrl(filters)
  }, [filters])

  useEffect(() => {
    syncFiltersToStorage(filters)
  }, [filters])

  useEffect(() => {
    if (
      !isLoginDialogOpen &&
      !isProfileDialogOpen &&
      !isNoteListOpen &&
      !activeNoteQuestion
    ) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLoginDialogOpen(false)
        setIsProfileDialogOpen(false)
        setIsNoteListOpen(false)
        setActiveNoteQuestion(null)
        setActiveNoteDraft('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeNoteQuestion, isLoginDialogOpen, isNoteListOpen, isProfileDialogOpen])

  const questionsQuery = useAlgoTopQuery({
    queryKey: ['questions', queryFilters, progressKey],
    queryFn: () => fetchQuestions(queryFilters, progress),
    placeholderData: keepPreviousData,
  })
  const companiesQuery = useAlgoTopQuery({
    queryKey: ['companies'],
    queryFn: fetchCompanies,
  })
  const departmentsQuery = useAlgoTopQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  })
  const jobsQuery = useAlgoTopQuery({ queryKey: ['jobs'], queryFn: fetchJobs })
  const tagsQuery = useAlgoTopQuery({ queryKey: ['tags'], queryFn: fetchTags })
  const noteIds = useMemo(
    () =>
      Object.entries(notes)
        .filter(([, note]) => hasQuestionNote(note))
        .map(([id]) => id)
        .sort((a, b) => Number(a) - Number(b)),
    [notes],
  )
  const noteQuestionsQuery = useAlgoTopQuery({
    queryKey: ['note-questions', noteIds.join(','), progressKey],
    queryFn: () => fetchQuestionsByIds(noteIds, progress),
  })

  const companies = companiesQuery.data ?? []
  const jobs = jobsQuery.data ?? []
  const tags = tagsQuery.data ?? []
  const questions = questionsQuery.data?.items ?? EMPTY_QUESTIONS
  const noteQuestions = noteQuestionsQuery.data ?? EMPTY_QUESTIONS
  const total = questionsQuery.data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const noteQuestionMap = useMemo(
    () => new Map(noteQuestions.map((question) => [String(question.id), question])),
    [noteQuestions],
  )
  const noteEntries = useMemo(
    () =>
      Object.entries(notes)
        .filter(([, note]) => hasQuestionNote(note))
        .map(([id, note]) => ({
          id,
          note,
          question: noteQuestionMap.get(id),
        }))
        .sort(
          (a, b) =>
            new Date(b.note.updatedAt).getTime() - new Date(a.note.updatedAt).getTime(),
        ),
    [noteQuestionMap, notes],
  )
  const progressStats = useMemo(() => {
    const items = Object.values(progress)
    const doneCount = items.filter((item) => item.done).length

    return {
      doneCount,
    }
  }, [progress])
  const activityDays = useMemo(
    () => buildActivityDays(progress, notes),
    [notes, progress],
  )
  const departments = useMemo(() => {
    if (!filters.company) return []
    const items = departmentsQuery.data ?? []
    return items.filter(
      (department) => department.company === Number(filters.company),
    )
  }, [departmentsQuery.data, filters.company])
  const isInitialLoading = questionsQuery.isLoading && questions.length === 0
  const setQuestionMastery = useCallback(
    (id: number, mastery: MasteryRating) => {
      setProgress((current) => {
        const key = String(id)
        const next = { ...current }
        const item = { ...(next[key] ?? {}) }
        const previousMastery = item.mastery ?? 0

        if (previousMastery === mastery) return current

        if (mastery === 0) {
          delete item.mastery
        } else {
          item.mastery = mastery
        }

        if (!item.done && !item.mastery) {
          delete next[key]
        } else {
          item.updatedAt = new Date().toISOString()
          next[key] = item
        }

        return next
      })
    },
    [],
  )
  const setQuestionDone = useCallback((id: number, done: boolean) => {
    setProgress((current) => {
      const key = String(id)
      const next = { ...current }
      const item = { ...(next[key] ?? {}) }

      if (Boolean(item.done) === done) return current

      if (done) {
        item.done = true
      } else {
        delete item.done
      }

      if (!item.done && !item.mastery) {
        delete next[key]
      } else {
        item.updatedAt = new Date().toISOString()
        next[key] = item
      }

      return next
    })
  }, [])
  const openQuestionNote = useCallback(
    (question: Question) => {
      setActiveNoteQuestion(question)
      setActiveNoteDraft(
        notes[String(question.id)]?.content ?? makeDefaultNoteContent(question),
      )
    },
    [notes],
  )
  const closeQuestionNote = useCallback(() => {
    setActiveNoteQuestion(null)
    setActiveNoteDraft('')
  }, [])
  const setQuestionNote = useCallback((question: Question, content: string) => {
    setNotes((current) => {
      const key = String(question.id)
      const shouldSave =
        content.trim().length > 0 && !isDefaultNoteContent(question, content)

      if (!shouldSave && !current[key]) return current
      if (shouldSave && current[key]?.content === content) return current

      const next = { ...current }

      if (!shouldSave) {
        delete next[key]
      } else {
        next[key] = {
          content,
          updatedAt: new Date().toISOString(),
        }
      }

      return next
    })
  }, [])
  const exportQuestionNote = useCallback(
    (question: Question) => {
      const note = notes[String(question.id)]
      if (!hasQuestionNote(note)) return

      const blob = new window.Blob([makeNoteMarkdown(question, note)], {
        type: 'text/markdown;charset=utf-8',
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = url
      link.download = makeNoteFilename(question)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    },
    [notes],
  )
  const beginGithubLogin = useCallback(async () => {
    if (!githubOAuthConfig) {
      setGithubLoginError('GitHub OAuth 登录未配置')
      setIsLoginDialogOpen(true)
      return
    }

    setIsGithubLoginLoading(true)
    setGithubLoginError('')

    try {
      await startGithubOAuthLogin(githubOAuthConfig)
    } catch (error) {
      setGithubLoginError(error instanceof Error ? error.message : 'GitHub 登录失败')
      setIsLoginDialogOpen(true)
      setIsGithubLoginLoading(false)
    }
  }, [githubOAuthConfig])
  const logoutGithub = useCallback(() => {
    setGithubUser(null)
    setGithubToken('')
    setGistSyncMeta({})
    setIsProfileDialogOpen(false)
    setSyncMessage('')
  }, [])
  const updateLocalProfile = useCallback((profile: LocalProfile) => {
    setLocalProfile({
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      updatedAt: new Date().toISOString(),
    })
  }, [])
  const exportAllNotes = useCallback(() => {
    const items = noteEntries.map(({ id, question, note }) => ({
      id,
      question,
      note,
    }))

    if (items.length === 0) return

    downloadTextFile(
      `algotop-notes-${formatDateStamp()}.md`,
      makeAllNotesMarkdown(items),
      'text/markdown;charset=utf-8',
    )
  }, [noteEntries])
  const exportLocalBackup = useCallback(() => {
    const payload = createSyncPayload({
      user: githubUser,
      progress,
      notes,
      filters,
      theme: themePreference,
      localProfile,
    })

    downloadTextFile(
      `algotop-backup-${formatDateStamp()}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8',
    )
  }, [filters, githubUser, localProfile, notes, progress, themePreference])
  const applyExternalPayload = useCallback(
    (rawPayload: unknown) => {
      const payload = normalizeSyncPayload(rawPayload)
      const currentPayload = createSyncPayload({
        user: githubUser,
        progress,
        notes,
        filters,
        theme: themePreference,
        localProfile,
      })
      const comparablePayload = {
        ...payload,
        localProfile: payload.localProfile ?? currentPayload.localProfile,
      }
      const hasConflict =
        hasUserPayloadData(currentPayload) &&
        compareUserPayload(currentPayload) !== compareUserPayload(comparablePayload)

      if (hasConflict && !window.confirm('覆盖当前进度和笔记？')) {
        setSyncMessage('已取消')
        return false
      }

      setProgress(payload.progress ?? {})
      setNotes(payload.notes ?? {})
      if (payload.localProfile) {
        setLocalProfile(payload.localProfile)
      }
      setFilters(payload.preferences?.filters ?? initialFilters)
      setThemePreference(normalizeThemePreference(payload.preferences?.theme))

      return true
    },
    [filters, githubUser, localProfile, notes, progress, themePreference],
  )
  const importLocalBackup = useCallback(
    async (file: File) => {
      try {
        if (applyExternalPayload(JSON.parse(await file.text()))) {
          setSyncMessage('已导入')
        }
      } catch {
        setSyncMessage('导入失败')
      }
    },
    [applyExternalPayload],
  )
  const pushGistSync = useCallback(async () => {
    if (!githubToken) {
      setIsProfileDialogOpen(false)
      setIsLoginDialogOpen(true)
      return
    }

    setIsGistSyncing(true)
    setSyncMessage('上传中')

    try {
      const nextMeta = await pushAlgoTopGist({
        token: githubToken,
        gistId: gistSyncMeta.gistId,
        payload: createSyncPayload({
          user: githubUser,
          progress,
          notes,
          filters,
          theme: themePreference,
          localProfile,
        }),
      })

      setGistSyncMeta(nextMeta)
      setSyncMessage('已上传到 Gist')
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : '上传失败')
    } finally {
      setIsGistSyncing(false)
    }
  }, [
    filters,
    gistSyncMeta.gistId,
    githubToken,
    githubUser,
    localProfile,
    notes,
    progress,
    themePreference,
  ])
  const pullGistSync = useCallback(async () => {
    if (!githubToken) {
      setIsProfileDialogOpen(false)
      setIsLoginDialogOpen(true)
      return
    }

    setIsGistSyncing(true)
    setSyncMessage('拉取中')

    try {
      const { payload, meta } = await pullAlgoTopGist(githubToken, gistSyncMeta.gistId)
      if (applyExternalPayload(payload)) {
        setGistSyncMeta(meta)
        setSyncMessage('已拉取')
      }
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : '拉取失败')
    } finally {
      setIsGistSyncing(false)
    }
  }, [applyExternalPayload, gistSyncMeta.gistId, githubToken])

  const columns = useMemo<ColumnDef<Question>[]>(
    () => [
      {
        accessorKey: 'displayId',
        header: '题目',
        cell: ({ row }) => (
          <a
            className='question-link'
            href={buildQuestionUrl(row.original)}
            target='_blank'
            rel='noreferrer'
          >
            <span>{row.original.displayId}.</span>
            <span>{row.original.title}</span>
          </a>
        ),
      },
      {
        accessorKey: 'level',
        header: '难度',
        cell: ({ row }) => (
          <span className={`level level-${row.original.level}`}>
            {DIFFICULTY_LABEL[row.original.level]}
          </span>
        ),
      },
      {
        accessorKey: 'time',
        header: '最近',
        cell: ({ row }) => row.original.date,
      },
      {
        accessorKey: 'frequency',
        header: '频度',
        cell: ({ row }) => (
          <div className='frequency-cell'>
            <span>{row.original.frequency}</span>
            <small>{row.original.date}</small>
          </div>
        ),
      },
      {
        accessorKey: 'rate',
        header: '掌握',
        cell: ({ row }) => (
          <MasteryStars question={row.original} onChange={setQuestionMastery} />
        ),
      },
      {
        id: 'actions',
        header: '操作',
        cell: ({ row }) => {
          const note = notes[String(row.original.id)]
          const hasNote = hasQuestionNote(note)

          return (
            <div className='action-cell'>
              <button
                className={`action-button ${row.original.done ? 'is-done' : ''}`}
                type='button'
                onClick={() =>
                  setQuestionDone(row.original.id, !row.original.done)
                }
                aria-label={row.original.done ? '标记未做' : '标记已做'}
                aria-pressed={row.original.done}
                title={row.original.done ? '已做' : '未做'}
              >
                {row.original.done ? '已做' : '未做'}
              </button>
              <button
                className={`action-button note-button ${
                  hasNote ? 'is-note-active' : ''
                }`}
                type='button'
                onClick={() => openQuestionNote(row.original)}
                aria-label={hasNote ? '编辑笔记' : '创建笔记'}
                aria-pressed={hasNote}
                title={hasNote ? '编辑笔记' : '创建笔记'}
              >
                笔记
              </button>
            </div>
          )
        },
      },
    ],
    [notes, openQuestionNote, setQuestionDone, setQuestionMastery],
  )

  const table = useReactTable({
    data: questions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
  })

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => {
      const next = {
        ...current,
        [key]: value,
        page: key === 'page' ? Number(value) : 1,
      }

      if (key === 'company') {
        next.department = ''
      }

      return next
    })
  }

  function updateOrdering(field: 'leetcode' | 'frequency' | 'time') {
    setFilters((current) => {
      const nextOrdering = current.ordering === field ? `-${field}` : field
      return { ...current, ordering: nextOrdering, page: 1 }
    })
  }

  function clearFilters() {
    setFilters(initialFilters)
  }

  const hasFilters = Object.entries(filters).some(([key, value]) => {
    if (key === 'page') return value !== 1
    if (key === 'ordering') return value !== '-frequency'
    return value !== ''
  })
  const activeFilterChips = [
    filters.search && {
      key: 'search',
      label: '搜索',
      value: filters.search,
      clear: () => updateFilter('search', ''),
    },
    filters.company && {
      key: 'company',
      label: '公司',
      value:
        companies.find((company) => company.id === Number(filters.company))
          ?.name ?? filters.company,
      clear: () => updateFilter('company', ''),
    },
    filters.department && {
      key: 'department',
      label: '部门',
      value:
        departments.find(
          (department) => department.id === Number(filters.department),
        )?.name ?? filters.department,
      clear: () => updateFilter('department', ''),
    },
    filters.job && {
      key: 'job',
      label: '岗位',
      value:
        jobs.find((job) => job.id === Number(filters.job))?.name ?? filters.job,
      clear: () => updateFilter('job', ''),
    },
    filters.level && {
      key: 'level',
      label: '难度',
      value:
        DIFFICULTY_LABEL[
          Number(filters.level) as keyof typeof DIFFICULTY_LABEL
        ],
      clear: () => updateFilter('level', ''),
    },
    filters.tag && {
      key: 'tag',
      label: '标签',
      value:
        tags.find((tag) => tag.id === Number(filters.tag))?.name ?? filters.tag,
      clear: () => updateFilter('tag', ''),
    },
    filters.completion && {
      key: 'completion',
      label: '完成',
      value: COMPLETION_LABELS[filters.completion],
      clear: () => updateFilter('completion', ''),
    },
    filters.status && {
      key: 'status',
      label: '掌握',
      value: STATUS_LABELS[filters.status],
      clear: () => updateFilter('status', ''),
    },
    filters.ordering !== '-frequency' && {
      key: 'ordering',
      label: '排序',
      value: ORDERING_LABELS[filters.ordering] ?? filters.ordering,
      clear: () => updateFilter('ordering', '-frequency'),
    },
  ].filter(Boolean) as Array<{
    key: string
    label: string
    value: string
    clear: () => void
  }>

  return (
    <main className='app-shell'>
      <header className='topbar'>
        <a className='brand' href='/' aria-label='AlgoTop'>
          AlgoTop
        </a>
        <nav aria-label='主导航'>
          <AccountMenu
            user={githubUser}
            localProfile={localProfile}
            noteCount={noteEntries.length}
            syncMessage={syncMessage}
            isSyncing={isGistSyncing}
            themePreference={themePreference}
            onThemeChange={setThemePreference}
            onOpenProfile={() => setIsProfileDialogOpen(true)}
            onOpenNotes={() => setIsNoteListOpen(true)}
            onLogin={() => {
              setGithubLoginError('')
              setIsLoginDialogOpen(true)
            }}
            onLogout={logoutGithub}
            onPushSync={pushGistSync}
            onPullSync={pullGistSync}
          />
        </nav>
      </header>

      <section className='workspace' aria-label='题目列表'>
        <div className='filters-row'>
          <label className='search-field'>
            <Search size={17} strokeWidth={1.7} />
            <input
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
              placeholder='搜索题目名称或编号'
            />
            {filters.search && (
              <button
                className='icon-button'
                type='button'
                onClick={() => updateFilter('search', '')}
                aria-label='清空搜索'
                title='清空搜索'
              >
                <X size={15} strokeWidth={1.8} />
              </button>
            )}
          </label>

          <div className='primary-filters'>
            <select
              value={filters.company}
              onChange={(event) => updateFilter('company', event.target.value)}
              aria-label='公司'
            >
              <option value=''>公司</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>

            <select
              value={filters.department}
              onChange={(event) =>
                updateFilter('department', event.target.value)
              }
              disabled={!filters.company}
              aria-label='部门'
            >
              <option value=''>部门</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>

            <select
              value={filters.job}
              onChange={(event) => updateFilter('job', event.target.value)}
              aria-label='岗位'
            >
              <option value=''>岗位</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.name}
                </option>
              ))}
            </select>

          </div>

          <button
            className={`icon-button reset-button ${hasFilters ? 'is-visible' : ''}`}
            type='button'
            onClick={clearFilters}
            disabled={!hasFilters}
            aria-hidden={!hasFilters}
            aria-label='重置筛选'
            title='重置筛选'
          >
            <RotateCcw size={15} strokeWidth={1.8} />
          </button>
        </div>

        <div className='compact-filters' aria-label='辅助筛选'>
          <select
            className='compact-select'
            value={filters.level}
            onChange={(event) => updateFilter('level', event.target.value)}
            aria-label='难度'
          >
            <option value=''>难度</option>
            <option value='1'>容易</option>
            <option value='2'>中等</option>
            <option value='3'>困难</option>
          </select>

          <select
            className='compact-select'
            value={filters.completion}
            onChange={(event) =>
              updateFilter('completion', event.target.value as CompletionFilter)
            }
            aria-label='完成'
          >
            <option value=''>完成</option>
            <option value='done'>已做</option>
            <option value='todo'>未做</option>
          </select>

          <select
            className='compact-select'
            value={filters.status}
            onChange={(event) =>
              updateFilter('status', event.target.value as StatusFilter)
            }
            aria-label='掌握'
          >
            <option value=''>掌握</option>
            <option value='unrated'>未标注</option>
            <option value='rating-1'>一星</option>
            <option value='rating-2'>二星</option>
            <option value='rating-3'>三星</option>
          </select>

          <select
            className='compact-select compact-select-wide'
            value={filters.tag}
            onChange={(event) => updateFilter('tag', event.target.value)}
            aria-label='标签'
          >
            <option value=''>标签</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>

          <select
            className='compact-select compact-select-wide'
            value={filters.ordering}
            onChange={(event) => updateFilter('ordering', event.target.value)}
            aria-label='排序'
          >
            <option value='-frequency'>频度高到低</option>
            <option value='-time'>最近考察</option>
            <option value='time'>最早考察</option>
            <option value='leetcode'>题号小到大</option>
            <option value='-leetcode'>题号大到小</option>
          </select>
        </div>

        <div
          className={`filter-chips ${activeFilterChips.length > 0 ? 'is-visible' : ''}`}
          aria-label='已选筛选'
          aria-hidden={activeFilterChips.length === 0}
        >
          {activeFilterChips.map((chip) => (
            <button
              className='filter-chip'
              type='button'
              key={chip.key}
              onClick={chip.clear}
              title={`移除${chip.label}`}
            >
              <span>{chip.label}</span>
              <strong>{chip.value}</strong>
              <X size={13} strokeWidth={1.8} />
            </button>
          ))}
        </div>

        <div className='summary-line' aria-live='polite'>
          <span>{total} 题</span>
          {questionsQuery.error && (
            <button
              className='refresh-button'
              type='button'
              onClick={() => questionsQuery.refetch()}
              aria-label='重新加载'
              title='重新加载'
            >
              <RotateCw size={15} strokeWidth={1.8} />
            </button>
          )}
        </div>

        <div className='table-wrap'>
          <table>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const sortField =
                      header.column.id === 'displayId'
                        ? 'leetcode'
                        : header.column.id === 'frequency'
                          ? 'frequency'
                          : header.column.id === 'time'
                            ? 'time'
                            : undefined
                    return (
                      <th key={header.id}>
                        {sortField ? (
                          <button
                            className='sort-button'
                            type='button'
                            onClick={() => updateOrdering(sortField)}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {filters.ordering.replace('-', '') === sortField &&
                              (filters.ordering.startsWith('-') ? (
                                <ArrowDown size={13} strokeWidth={1.8} />
                              ) : (
                                <ArrowUp size={13} strokeWidth={1.8} />
                              ))}
                          </button>
                        ) : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )
                        )}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {isInitialLoading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <tr className='skeleton-row' key={index}>
                      <td colSpan={columns.length}>
                        <span />
                      </td>
                    </tr>
                  ))
                : table.getRowModel().rows.map((row) => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {!isInitialLoading && questions.length === 0 && (
          <div className='empty-state'>暂无结果</div>
        )}

        <div className='pager' aria-label='分页'>
          <button
            className='icon-button'
            type='button'
            onClick={() => updateFilter('page', Math.max(1, filters.page - 1))}
            disabled={filters.page <= 1}
            aria-label='上一页'
            title='上一页'
          >
            <ChevronLeft size={17} strokeWidth={1.8} />
          </button>
          <span>
            {filters.page} / {totalPages}
          </span>
          <button
            className='icon-button'
            type='button'
            onClick={() =>
              updateFilter('page', Math.min(totalPages, filters.page + 1))
            }
            disabled={filters.page >= totalPages}
            aria-label='下一页'
            title='下一页'
          >
            <ChevronRight size={17} strokeWidth={1.8} />
          </button>
        </div>
      </section>

      {isLoginDialogOpen && (
        <LoginDialog
          error={githubLoginError}
          isConfigured={Boolean(githubOAuthConfig)}
          isLoading={isGithubLoginLoading}
          onClose={() => setIsLoginDialogOpen(false)}
          onLogin={beginGithubLogin}
        />
      )}

      {isProfileDialogOpen && (
        <ProfileDialog
          user={githubUser}
          localProfile={localProfile}
          stats={progressStats}
          noteCount={noteEntries.length}
          activityDays={activityDays}
          gistUrl={gistSyncMeta.gistUrl}
          lastSyncedAt={gistSyncMeta.lastSyncedAt}
          syncMessage={syncMessage}
          isSyncing={isGistSyncing}
          onClose={() => setIsProfileDialogOpen(false)}
          onLogin={() => {
            setGithubLoginError('')
            setIsProfileDialogOpen(false)
            setIsLoginDialogOpen(true)
          }}
          onLogout={logoutGithub}
          onLocalProfileChange={updateLocalProfile}
          onExportNotes={exportAllNotes}
          onExportBackup={exportLocalBackup}
          onImportBackup={importLocalBackup}
          onPushSync={pushGistSync}
          onPullSync={pullGistSync}
        />
      )}

      {isNoteListOpen && (
        <NoteListDialog
          notes={noteEntries}
          onClose={() => setIsNoteListOpen(false)}
          onExportNotes={exportAllNotes}
          onOpenNote={(question) => {
            setIsNoteListOpen(false)
            openQuestionNote(question)
          }}
        />
      )}

      {activeNoteQuestion && (
        <div className='note-page-layer'>
          <Suspense
            fallback={
              <section
                className='note-dialog note-dialog-loading'
                role='status'
              >
                <span>加载中</span>
              </section>
            }
          >
            <NoteEditorDialog
              question={activeNoteQuestion}
              note={notes[String(activeNoteQuestion.id)]}
              value={activeNoteDraft}
              onChange={(value) => {
                setActiveNoteDraft(value)
                setQuestionNote(activeNoteQuestion, value)
              }}
              onClose={closeQuestionNote}
              onExport={() => exportQuestionNote(activeNoteQuestion)}
            />
          </Suspense>
        </div>
      )}
    </main>
  )
}
