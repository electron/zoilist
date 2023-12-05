import { ProbotOctokit } from 'probot';
import { WebClient } from '@slack/web-api';
import { isQuietPeriod } from './util';
const { SLACK_BOT_TOKEN, NODE_ENV } = process.env;

if (!SLACK_BOT_TOKEN && NODE_ENV !== 'test') {
  console.error('Missing environment variable SLACK_BOT_TOKEN');
  process.exit(1);
}

const slack = new WebClient(SLACK_BOT_TOKEN);

const octokit = new ProbotOctokit();

async function main() {
  const q = `is:pr is:open -is:draft label:"api-review/requested 🗳" -label:"api-review/approved ✅" -label:"wip ⚒"`;
  const searchUrl = 'https://github.com/electron/electron/pulls?q=' + encodeURIComponent(q);
  const items = await octokit.paginate(octokit.search.issuesAndPullRequests, {
    q: `repo:electron/electron ${q}`,
    sort: 'created',
  });

  // silence during quiet period
  if (items.length && !isQuietPeriod()) {
    const text =
      `:blob-wave: *Reminder:* the <${searchUrl}|following PRs> are awaiting API review.\n` +
      items
        .map((item) => {
          const escapedTitle = item.title.replace(
            /[&<>]/g,
            (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[x]!,
          );
          const assignment = item.assignees?.length
            ? item.assignees.map((a) => `@${a!.login}`).join(', ')
            : '_unassigned_';
          return `• *<${item.html_url}|${escapedTitle} (#${item.number})>* (${assignment})`;
        })
        .join('\n');
    slack.chat.postMessage({
      channel: '#wg-api',
      unfurl_links: false,
      text,
    });
  }
}

if (require.main === module) main();
