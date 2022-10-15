const core = require('@actions/core');
const AWS = require('aws-sdk');

/**
 * Waits for given AWS ECS services transition into "servicesStable" state.
 * Times out after 10 minutes.
 * @param   {Object}   params
 * @param   {AWS.ECS}  params.ecsConnection - An AWS ECS connection object
 * @param   {string}   params.cluster       - The name of the ECS cluster
 * @param   {string[]} params.services      - A list of ECS services to check for stability
 * @returns {Promise}                         A promise to be resolved when services are stable or rejected after the timeout
 */
const waitForStability = ({ ecsConnection, cluster, services }) =>
  ecsConnection.waitFor('servicesStable', { cluster, services }).promise();

/**
 * Retries the ECS services stability check for the given amount of retries.
 * @param   {Object}   params
 * @param   {number}   params.retries - The number of times to retry the stability check
 * @param   {boolean}  params.verbose - Whether to print verbose log messages
 * @param   {Object}   params.params  - The rest of the parameters
 * @returns {number}                    The number of tries we did
 */
const retry = async ({ retries, verbose, ...params }) => {
  let currTry = 1;
  let isStable = false;
  while (currTry <= retries && !isStable) {
    try {
      if (verbose) {
        console.info(`Waiting for service stability, try #${currTry}`);
      }
      await waitForStability(params);
      isStable = true;
    } catch {
      if (verbose) {
        console.warn(`Try #${currTry} failed!`);
      }
      ++currTry;
    }
  }

  return currTry;
};

/**
 * Creates an AWS ECS connection using the given credentials.
 * @param   {Object}  params
 * @param   {string}  params.accessKeyId     - The AWS_ACCESS_KEY_ID
 * @param   {string}  params.secretAccessKey - The AWS_SECRET_ACCESS_KEY
 * @param   {string}  params.region          - The AWS_REGION
 * @returns {AWS.ECS}                          An AWS ECS connection object
 */
const createEcsConnection = (credentials) =>
  new AWS.ECS({
    apiVersion: '2014-11-13',
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken,
    region: credentials.region
  });


  async function assumeRoleInAccount() {
    const command = new clientSTS.AssumeRoleCommand({
        RoleArn: `arn:aws:iam::076699035263:role/test-github-ecs`,
        RoleSessionName: `test-gh-ecs`
    });

    const assumedRole = await stsClient.send(command)
    return {
        accessKeyId: assumedRole.Credentials.AccessKeyId,
        secretAccessKey: assumedRole.Credentials.SecretAccessKey,
        sessionToken: assumedRole.Credentials.SessionToken,
        region: 'us-east-1'
    }
}




/**
 * Extracts step params from environment and context
 * @returns {Object} The params needed to run this action
 */
const extractParams = () => {
  const params = {
    accessKeyId:
      core.getInput('aws-access-key-id') || process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey:
      core.getInput('aws-secret-access-key') ||
      process.env.AWS_SECRET_ACCESS_KEY,
    region: core.getInput('aws-region') || process.env.AWS_REGION,
    sessionTeoken: core.getInput('aws-session-token') || process.env.AWS_SESSION_TOKEN,
    retries: parseInt(core.getInput('retries'), 10),
    cluster: core.getInput('ecs-cluster'),
    services: JSON.parse(core.getInput('ecs-services')),
    verbose: core.getInput('verbose') === 'true',
  };

  if (!params.accessKeyId || !params.secretAccessKey || !params.region) {
    core.setFailed(
      'AWS credentials were not found in inputs or environment variables.'
    );
    return null;
  }

  return params;
};

/**
 * The GitHub Action entry point.
 */
const main = async () => {
  try {
    const params = extractParams();

    const credentials = await assumeRoleInAccount();


    if (!params) {
      return;
    }

    const ecsConnection = createEcsConnection(credentials);
    params['ecsConnection'] = ecsConnection;

    const actualRetries = await retry(params);
    // if (actualRetries > params.retries) {
    //   if (params.verbose) {
    //     console.error(`Service is not stable after ${params.retries} retries!`);
    //   }
    //   core.setFailed(`Service is not stable after ${params.retries} retries!`);
    // } else {
    //   if (params.verbose) {
    //     console.log(`Service is stable after ${actualRetries} retries!`);
    //   }
    //   core.setOutput('retries', actualRetries.toString());
    // }
  } catch (error) {
    core.setFailed(error.message);
  }
};

main();
