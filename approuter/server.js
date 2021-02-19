var approuter = require("@sap/approuter");
var vcapUtils = require("@sap/approuter/lib/utils/vcap-utils");
var loggingUtils = require("@sap/approuter/lib/utils/logger");
var logger = loggingUtils.getLogger("/Subscription");
var subscriptionUtils = require("@sap/approuter/lib/utils/subscription-utils");
var request = require("request");
var bodyParser = require("body-parser");
var fs = require("fs");
var envVars = {};

const { env } = require("process");

// Fill env from default-env.json
// AppRouter will do it later anyway, but its needed for the TENANT_HOST_PATTERN and LOCAL_APP_ROUTE before hand
if (fs.existsSync("default-env.json")) {
  envVars = JSON.parse(fs.readFileSync("default-env.json"));
  for (const name of Object.getOwnPropertyNames(envVars)) {
    env[name] = envVars[name];
  }
}

const tenantHostPatternString =
  process.env["TENANT_HOST_PATTERN"] || envVars.TENANT_HOST_PATTERN;
const SUBDOMAIN_REGEX = /\(\.\*\)/;
if (!tenantHostPatternString.match(SUBDOMAIN_REGEX))
  throw new Error(
    "TENANT_HOST_PATTERN does not contain placeholder for subdomain: (.*)"
  );

/**
 *  the backend destination is defined in the approuter module:
 *
 *      - name: srv_api
 *        group: destinations
 *        properties:
 *          name: srv_api  <------- this is the required backend destination name
 *          url: ~{url}
 *          forwardAuthToken: true
 *
 * here, the destination name is "srv_api", which is used in the next statement:
 * var backendBaseUrl = getDestinationFromEnv("srv_api").url;
 */
const backendBaseUrl = getDestinationFromEnv("srv-api").url;
const backendGetDependenciesCallbackUrl =
  backendBaseUrl + "/mtx/v1/provisioning/dependencies";
const backendOnSubscriptionCallbackUrl =
  backendBaseUrl + "/mtx/v1/provisioning/tenant/";

var ar = approuter();
ar.first.use("/callback/v1.0/tenants", bodyParser.json());

//---------------------------------------------------------------------------------------------
// getDependencies
// https://wiki.wdf.sap.corp/wiki/display/CloudFront/CIS+Integration+in+Approuter
//---------------------------------------------------------------------------------------------
ar.first.use(
  "/callback/v1.0/dependencies",
  async function custom_getDependencies(req, res, next) {

    const tracer = getTracer(req);
    try {
      tracer.debug("custom_getDependencies");

      const missingBindingErr = isSaaSRegistryBound();
      if (missingBindingErr) throw missingBindingErr;

      await checkScopes(req);

      const options = {
        url: backendGetDependenciesCallbackUrl,
        headers: {
          authorization: req.headers.authorization,
        },
      };

      tracer.debug("custom_getDependencies: retrieving dependencies from backend: " + options.url);
      const backendDependencies = await new Promise((resolve, reject) =>
        request.get(options, function (err, response) {
          if (err) return reject(err);

          // get backend dependencies and merge it with the dependencies detected by the approuter
          tracer.debug(
            "custom_getDependencies: response.body=" + response.body
          );
          resolve(JSON.parse(response.body));
        })
      );

      const getDependencies =
        subscriptionUtils.getSaaSRegistryDependencies /* approuter >=9 */ ||
        subscriptionUtils.getDependencies; /* approuter <9 */
      if (!getDependencies)
        throw new Error(
          "No method getDependencies() or getSaaSRegistryDependencies() found. Check your AppRouter for changes in subscription-utils.js."
        );

      const approuterDependencies = getDependencies.apply(subscriptionUtils);

      var mergedDependencies = JSON.stringify(
        approuterDependencies.concat(backendDependencies)
      );
      tracer.debug("custom_getDependencies: merged dependencies=" + mergedDependencies);

      res.setHeader("Content-Type", "application/json");
      res.end(mergedDependencies);
      tracer.debug("custom_getDependencies: done");
    } catch (error) {
      logger.error(`Error in custom_getDependencies(): ${error.stack}`);
      next(error);
    }
  }
);

//---------------------------------------------------------------------------------------------
// onSubscription
// https://wiki.wdf.sap.corp/wiki/display/CloudFront/CIS+Integration+in+Approuter
//---------------------------------------------------------------------------------------------
ar.first.use(
  "/callback/v1.0/tenants", async function custom_onSubscription(req, res, next) {

    const tracer = getTracer(req);
    try {
      tracer.debug(`custom_onSubscription: ${req.body}`);

      var missingBindingErr = isSaaSRegistryBound();
      if (missingBindingErr) throw missingBindingErr;

      await checkScopes(req);
      tracer.debug(`custom_onSubscription: host ${req.headers.host}`);

      var options = {
        url: backendOnSubscriptionCallbackUrl + req.body.subscribedTenantId,
        body: req.body,
        json: true,
        headers: {
          authorization: req.headers.authorization
        }
      };

      if (req.method == "PUT") {
        tracer.debug(
          "custom_onSubscription: creating subscription for tenant: " +
            req.body.subscribedTenantId +
            " (" +
            req.body.subscribedSubdomain +
            ")"
        );
        tracer.debug("custom_onSubscription: invoking backend callback: " + options.url);

        const appUrl = await new Promise((resolve, reject) => {
          request.put(options, (err, response) => {
            if (err) return reject(err);
            tracer.debug(
              `custom_onSubscription: response from app ${response.statusCode} ${response.statusMessage} ${response.subscribedSubdomain}`
            );
            resolve(
              "https://" +
                    tenantHostPatternString
                        .replace(SUBDOMAIN_REGEX, req.body.subscribedSubdomain)
                        .replace(/[\^\$]/g, "")
            );
          });
        });

        tracer.debug("custom_onSubscription: tenant's app url: " + appUrl);
        console.log(appUrl);
        res.setHeader("Content-Type", "text/plain");
        res.end(appUrl);

      } else if (req.method == "DELETE") {
        logger.info( `custom_onSubscription: deleting subscription for tenant: ${req.body.subscribedTenantId} (${req.body.subscribedSubdomain})`);
        tracer.debug(
          "custom_onSubscription: invoking backend callback: " + options.url
        );

        await new Promise((resolve, reject) => {
          request.delete(options, function (err, response) {
            if (err) return reject(err);
            resolve();
          });
        });

        res.end();

      } else {
        next(
          subscriptionUtils.getError(
            "Invalid request method. Method PUT for onboarding and method DELETE for offboarding is required for this type of request",
            405
          )
        );
      }

      tracer.debug("custom_onSubscription: done");
    } catch (error) {
      logger.error(`Error in custom_onSubscription(): ${error.stack}`);
      next(error);
    }
  }
);

async function checkScopes(req) {
  return new Promise((resolve, reject) =>
    subscriptionUtils.checkScopes(req, (err) => (err ? reject(err) : resolve()))
  );
}

function isSaaSRegistryBound() {
  if (!vcapUtils.getServiceCredentialsByLabel("saas-registry")) {
    return subscriptionUtils.getError(
      "Binding to SaaS Registry is required for this type of request",
      400
    );
  }
  return null;
}

function getDestinationFromEnv(destinationName) {
  if (!("destinations" in process.env)) {
    return null;
  }
  var destinations = JSON.parse(process.env.destinations);
  var matchingDestinations = destinations.filter(function (destination) {
    return destination.name === destinationName;
  });
  if (matchingDestinations.length === 0) {
    return null;
  }
  return matchingDestinations[0];
}

function getTracer(req) {
    return req.loggingContext.getTracer(__filename);
}

if (env.LOCAL_APP_ROUTE) {
  console.log('Add dynamic route for "/app" for local testing.');
  const { getRouterConfig, initRouterConfig } = require("./local-app-route");
  ar.start({ getRouterConfig });
  initRouterConfig(ar);
} else {
  ar.start();
}