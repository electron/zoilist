import { Probot } from "probot";
import { WebClient } from '@slack/web-api';

const API_REVIEW_REQUESTED_LABEL_ID = 1603621692 // api-review/requested
const { SLACK_BOT_TOKEN } = process.env

if (!SLACK_BOT_TOKEN) {
  console.error('Missing environment variable SLACK_BOT_TOKEN')
  process.exit(1)
}

const slack = new WebClient(SLACK_BOT_TOKEN)

export = (app: Probot) => {
  app.on("pull_request.labeled", async (context) => {
    if (context.payload.label?.id === API_REVIEW_REQUESTED_LABEL_ID) {
      const escapedTitle = context.payload.pull_request.title.replace(/[&<>]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]!))
      slack.chat.postMessage({
        channel: '#wg-api',
        unfurl_links: false,
        text: `Hey <!subteam^SNSJW1BA9>! Just letting you know that the following PR needs API review:\n`+
          `*<${context.payload.pull_request._links.html.href}|${escapedTitle} (#${context.payload.pull_request.number})>*`
      })
    }
  });
};
