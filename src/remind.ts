import { ProbotOctokit } from 'probot';
import { WebClient } from '@slack/web-api';
import { isQuietPeriod, timeAgo } from './util';
import { Endpoints } from '@octokit/types';
const { SLACK_BOT_TOKEN, NODE_ENV } = process.env;

type IssueOrPullRequest = Endpoints['GET /search/issues']['response']['data']['items'][number];
type TeamMember = { login: string };

if (!SLACK_BOT_TOKEN && NODE_ENV !== 'test') {
  console.error('Missing environment variable SLACK_BOT_TOKEN');
  process.exit(1);
}

const slack = new WebClient(SLACK_BOT_TOKEN);

const octokit = new ProbotOctokit();

function getOwnerAndRepoFromUrl(url: string) {
  const urlObj = new URL(url);
  const pathSegments = urlObj.pathname.split('/').filter(Boolean);
  const [owner, repo] = pathSegments.slice(-2);
  return { owner, repo };
}

async function getReviewActivity(pr: IssueOrPullRequest) {
  const { owner, repo } = getOwnerAndRepoFromUrl(pr.repository_url);

  const [comments, reviewComments, reviews] = await Promise.all([
    octokit.paginate(octokit.issues.listComments, {
      owner,
      repo,
      issue_number: pr.number,
    }),
    octokit.paginate(octokit.pulls.listReviewComments, {
      owner,
      repo,
      pull_number: pr.number,
    }),
    octokit.paginate(octokit.pulls.listReviews, {
      owner,
      repo,
      pull_number: pr.number,
    }),
  ]);

  return [
    ...comments.map((item) => ({
      type: 'comment',
      user: item.user,
      author_association: item.author_association,
      created_at: new Date(item.created_at),
    })),
    ...reviewComments.map((item) => ({
      type: 'review_comment',
      user: item.user,
      author_association: item.author_association,
      created_at: new Date(item.created_at),
    })),
    ...reviews.map((item) => ({
      type: 'review',
      user: item.user,
      author_association: item.author_association,
      created_at: new Date(item.submitted_at!),
    })),
  ];
}

type PullRequestActivity = Awaited<ReturnType<typeof getReviewActivity>>[number];
type ActivityMap = Record<number, PullRequestActivity>;

async function findLatestTeamReviewActivity(pr: IssueOrPullRequest, teamMembers: TeamMember[]) {
  const allActivity = await getReviewActivity(pr);

  let latestActivity: PullRequestActivity | undefined;
  let latestActivityDate: Date | undefined;

  for (const activity of allActivity) {
    // Ignore older activity if one has been found
    if (latestActivityDate && latestActivityDate > activity.created_at) continue;

    // Ignore bots
    if (activity.user?.type !== 'User') continue;

    // Skip activity by PR authors
    if (activity.user?.login === pr.user?.login) continue;

    // Skip activity by non-WG team members
    if (!teamMembers.some((member) => member.login === activity.user?.login)) continue;

    latestActivity = activity;
    latestActivityDate = activity.created_at;
  }

  return latestActivity;
}

async function getActivityForPRs(
  prs: IssueOrPullRequest[],
  teamMembers: TeamMember[],
): Promise<ActivityMap> {
  const activity: ActivityMap = {};
  if (!teamMembers.length) {
    console.warn('getActivityForPRs: No team members found, skipping.');
    return activity;
  }

  for (const pr of prs) {
    const latestActivity = await findLatestTeamReviewActivity(pr, teamMembers);
    if (latestActivity) activity[pr.number] = latestActivity;
  }
  return activity;
}

async function getApiWGTeamMembers(): Promise<TeamMember[]> {
  try {
    const { data: teamMembers } = await octokit.teams.listMembersInOrg({
      org: 'electron',
      team_slug: 'wg-api',
    });
    return teamMembers.map((m) => ({ login: m?.login! }));
  } catch (error) {
    console.error('Failed to fetch API WG team members:', error);

    // Allow reminder to be sent without this data.
    return [];
  }
}

async function getApiData(teamMembers: TeamMember[]) {
  const query = `is:pr is:open -is:draft label:"api-review/requested 🗳" -label:"api-review/approved ✅" -label:"wip ⚒"`;
  const items = await octokit.paginate(octokit.search.issuesAndPullRequests, {
    q: `repo:electron/electron ${query}`,
    sort: 'created',
  });
  const activity = await getActivityForPRs(items, teamMembers);
  return { items, query, activity };
}

async function getRfcData(teamMembers: TeamMember[]) {
  const query = `is:open is:pr label:pending-review`;
  const items = await octokit.paginate(octokit.search.issuesAndPullRequests, {
    q: `repo:electron/rfcs ${query}`,
    sort: 'created',
  });
  const activity = await getActivityForPRs(items, teamMembers);
  return { items, query, activity };
}

async function getReminderData() {
  const teamMembers = await getApiWGTeamMembers();
  const api = await getApiData(teamMembers);
  const rfc = await getRfcData(teamMembers);
  return { api, rfc };
}

const escapeTitle = (title: string) =>
  title.replace(/[&<>]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[x]!);

const formatSlackDate = (d: Date) => {
  const unixSeconds = Math.floor(d.getTime() / 1000);
  return `<!date^${unixSeconds}^{date_short}|${d.toDateString()}>`;
};

const formatPRListItem = (item: IssueOrPullRequest, activity?: PullRequestActivity) => {
  const createdAt = new Date(item.created_at);
  const reviewLabel = activity
    ? `Last reviewed by @${activity.user?.login} ${timeAgo(activity.created_at)} (${formatSlackDate(
        activity.created_at,
      )})`
    : `Awaiting review since ${timeAgo(createdAt)} (${formatSlackDate(createdAt)})`;

  return `• *<${item.html_url}|${escapeTitle(item.title)} (#${
    item.number
  })>*\n    _${reviewLabel}_`;
};

async function main() {
  // silence during quiet period
  if (isQuietPeriod()) return;

  const reminders: string[] = [];
  const { api, rfc } = await getReminderData();

  if (api.items.length) {
    const searchUrl =
      'https://github.com/electron/electron/pulls?q=' + encodeURIComponent(api.query);

    const reminder =
      `*<${searchUrl}|APIs>*\n` +
      api.items.map((item) => formatPRListItem(item, api.activity[item.number])).join('\n');

    reminders.push(reminder);
  }

  if (rfc.items.length) {
    const searchUrl = 'https://github.com/electron/rfcs/pulls?q=' + encodeURIComponent(rfc.query);

    const reminder =
      `*<${searchUrl}|RFCs>*\n` +
      rfc.items.map((item) => formatPRListItem(item, rfc.activity[item.number])).join('\n');

    reminders.push(reminder);
  }

  if (!reminders.length) {
    return;
  }

  const text = `:blob-wave: *Reminder:* the following PRs are awaiting review.\n\n${reminders.join(
    '\n\n',
  )}`;

  slack.chat.postMessage({
    channel: '#wg-api',
    unfurl_links: false,
    text,
  });
}

if (require.main === module) main();
