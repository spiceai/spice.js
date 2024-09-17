# Contributing to spice.js

## Requirements

* [NodeJS 18 or 20](https://nodejs.org/en/download/package-manager)
* [Docker](https://docs.docker.com/engine/install/)
* Yarn (`npm install -g yarn`)

## Developing

The development branch is `trunk`. This is the branch that all pull
requests should be made against.

To develop locally:

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your
   own GitHub account and then
   [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device.

2. Create a new branch:

   ```bash
   git checkout -b MY_BRANCH_NAME
   ```

3. Install the dependencies with:

   ```bash
   yarn install
   ```

4. To run the tests, create a `.env` file with your [Spice.ai](https://spice.ai) API Key:

   ```env
   API_KEY=<Spice.ai API Key>
   ```

5. Run the tests with:

   ```bash
   make test
   ```
