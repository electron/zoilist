import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Ensure the reminder takes the Slack-posting branch (module reads this at import time).
vi.hoisted(() => {
  process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
});

const MockWebClient = vi.hoisted(() => ({ chat: { postMessage: vi.fn() } }));

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn(function () {
    return MockWebClient;
  }),
}));

// Avoid any network auth setup in setupOctokit().
vi.mock('@electron/github-app-auth', () => ({
  getAuthOptionsForOrg: vi.fn(async () => ({})),
}));

// Stub ProbotOctokit so no real GitHub requests are made. `paginate` and `rest`
// are shared across instances so identities stay stable across setupOctokit().
const { paginate, listMembersInOrg } = vi.hoisted(() => ({
  paginate: vi.fn(),
  listMembersInOrg: vi.fn(),
}));

vi.mock('probot', () => {
  const rest = {
    search: { issuesAndPullRequests: { endpoint: 'search' } },
    issues: { listComments: { endpoint: 'listComments' } },
    pulls: {
      listReviewComments: { endpoint: 'listReviewComments' },
      listReviews: { endpoint: 'listReviews' },
    },
    teams: { listMembersInOrg },
  };
  return {
    ProbotOctokit: vi.fn(function () {
      return { paginate, rest };
    }),
  };
});

import { main } from '../src/remind';

type MockPROptions = { author_association?: string; created_at?: string };

const makePR = (
  number: number,
  title: string,
  repo = 'electron/electron',
  { author_association = 'MEMBER', created_at = '2023-11-01T00:00:00Z' }: MockPROptions = {},
) => ({
  number,
  title,
  html_url: `https://github.com/${repo}/pull/${number}`,
  repository_url: `https://api.github.com/repos/${repo}`,
  created_at,
  author_association,
  user: { login: 'pr-author' },
});

const APPROVED_PR = makePR(100, 'feat: approved and ready to merge');
const NEEDS_REVIEW_PR = makePR(200, 'feat: needs api review');
const RFC_PR = makePR(300, 'rfc: a shiny new proposal', 'electron/rfcs');

/** Route `octokit.paginate` search calls to the right fixture list by query. */
const mockSearchResults = ({
  approved = [] as unknown[],
  needsReview = [] as unknown[],
  rfc = [] as unknown[],
}) => {
  paginate.mockImplementation(async (_endpoint: unknown, params: { q?: string }) => {
    // Comment/review pagination has no `q`; those PRs have no team activity.
    if (!params?.q) return [];

    const q = params.q;
    if (q.includes('electron/rfcs')) return rfc;
    if (q.includes('api-review/requested')) return needsReview;
    if (q.includes('api-review/approved')) return approved;
    return [];
  });
};

describe('API WG reminder', () => {
  beforeEach(() => {
    vi.useFakeTimers().setSystemTime(new Date('2023-11-11'));
    MockWebClient.chat.postMessage.mockClear();
    paginate.mockReset();
    listMembersInOrg.mockReset();
    listMembersInOrg.mockResolvedValue({ data: [{ login: 'wg-member' }] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('posts every section, including the approved "ready for final review/merge" section', async () => {
    mockSearchResults({
      approved: [APPROVED_PR],
      needsReview: [NEEDS_REVIEW_PR],
      rfc: [RFC_PR],
    });

    await main();

    expect(MockWebClient.chat.postMessage).toHaveBeenCalledTimes(1);
    const { channel, text } = MockWebClient.chat.postMessage.mock.calls[0][0];

    expect(channel).toBe('#wg-api');

    // The new approved-API section and its PR.
    expect(text).toContain('APIs - Ready for final review/merge');
    expect(text).toContain('feat: approved and ready to merge (#100)');

    // The existing sections are still present.
    expect(text).toContain('APIs - Needs review');
    expect(text).toContain('feat: needs api review (#200)');
    expect(text).toContain('RFCs');
    expect(text).toContain('rfc: a shiny new proposal (#300)');

    // Summary reflects that there are PRs awaiting merge.
    expect(text).toContain('awaiting review or merge');
  });

  it('omits the approved section and adjusts the summary when nothing is ready to merge', async () => {
    mockSearchResults({
      approved: [],
      needsReview: [NEEDS_REVIEW_PR],
      rfc: [RFC_PR],
    });

    await main();

    expect(MockWebClient.chat.postMessage).toHaveBeenCalledTimes(1);
    const { text } = MockWebClient.chat.postMessage.mock.calls[0][0];

    expect(text).not.toContain('APIs - Ready for final review/merge');
    expect(text).toContain('APIs - Needs review');
    expect(text).toContain('RFCs');
    expect(text).toContain('awaiting review.');
    expect(text).not.toContain('awaiting review or merge');
  });

  it('does not post when there are no PRs in any section', async () => {
    mockSearchResults({ approved: [], needsReview: [], rfc: [] });

    await main();

    expect(MockWebClient.chat.postMessage).not.toHaveBeenCalled();
  });

  it('stays silent during the December quiet period', async () => {
    vi.setSystemTime(new Date('2023-12-25'));
    mockSearchResults({ approved: [APPROVED_PR], needsReview: [], rfc: [] });

    await main();

    expect(MockWebClient.chat.postMessage).not.toHaveBeenCalled();
  });
});
