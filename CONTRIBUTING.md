## Contributing to spice.js

### Developing

The development branch is `trunk`. This is the branch that all pull
requests should be made against.

To develop locally:

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your
   own GitHub account and then
   [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device.

2. Create a new branch:

   ```
   git checkout -b MY_BRANCH_NAME
   ```

3. Install Yarn

   ```
   npm install -g yarn
   ```

4. Install the dependencies with:

   ```
   yarn install
   ```

5. To run the tests, create a `.env` file with your [Spice.ai](https://spice.ai) API Key:

   ```
   API_KEY=<Spice.ai API Key>
   ```

6. Run the tests with:

   ```
   yarn test
   ```
