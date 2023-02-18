# zoilist

> A GitHub App built with [Probot](https://github.com/probot/probot) that Nag @electron/api-wg to review API PRs.

## Setup

```sh
# Clone this repository
git clone https://github.com/electron/zoilist.git

# Go into the repository
cd zoilist

# Install dependencies
yarn install

# Run the bot
yarn start
```

## Docker

```sh
# 1. Build container
docker build -t zoilist .

# 2. Start container
docker run -e APP_ID=<app-id> -e PRIVATE_KEY=<pem-value> zoilist
```

## Contributing

If you have suggestions for how zoilist could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2021 Jeremy Rose <nornagon@nornagon.net>
