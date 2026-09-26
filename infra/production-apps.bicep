// Phase 2: versioned images on the provisioned production services.
targetScope = 'resourceGroup'
param location string = 'centralindia'
param environmentId string
param defaultDomain string
param identityId string
param identityClientId string
param acrLoginServer string
param imageTag string
param webImageTag string = imageTag
param keyVaultUri string
param blobEndpoint string
param serviceBusFqdn string
param appInsightsConnectionString string
param googleClientId string
param visionEndpoint string
param openAiEndpoint string
param whisperDeployment string = 'whisper'
param deployServices bool = true
@description('Public hostname users reach the app on (custom domain bound to frameseek-web).')
param publicHostname string = 'app.frameseek.in'
@description('Name of the managed certificate for publicHostname in the Container Apps environment. It is issued once by `az containerapp hostname bind` (the DNS records must exist first).')
param publicHostnameCertificate string = 'mc-cae-fs-g7unyr2-app-frameseek-in-4688'

var webName = 'frameseek-web'
var apiName = 'frameseek-api'
var defaultOrigin = 'https://${webName}.${defaultDomain}'
var webOrigin = empty(publicHostname) ? defaultOrigin : 'https://${publicHostname}'
var workloadIdentity = { type: 'UserAssigned', userAssignedIdentities: { '${identityId}': {} } }
var registries = [{ server: acrLoginServer, identity: identityId }]
var apiImage = '${acrLoginServer}/frameseek-api:${imageTag}'
var commonEnv = [
  { name: 'DEBUG', value: 'false' }
  { name: 'PAYMENTS_ENABLED', value: 'false' }
  { name: 'DATABASE_SSL', value: 'true' }
  { name: 'COOKIE_SECURE', value: 'true' }
  { name: 'AZURE_CLIENT_ID', value: identityClientId }
  { name: 'AZURE_KEY_VAULT_URI', value: keyVaultUri }
  { name: 'AZURE_STORAGE_ACCOUNT_URL', value: blobEndpoint }
  { name: 'AZURE_VISION_ENDPOINT', value: visionEndpoint }
  { name: 'AZURE_OPENAI_ENDPOINT', value: openAiEndpoint }
  { name: 'AZURE_OPENAI_WHISPER_DEPLOYMENT', value: whisperDeployment }
  { name: 'AZURE_OPENAI_API_VERSION', value: '2024-06-01' }
  { name: 'GOOGLE_CLIENT_ID', value: googleClientId }
  { name: 'GOOGLE_OAUTH_REDIRECT_URI', value: '${webOrigin}/api/v1/auth/google/callback' }
  { name: 'FRONTEND_URL', value: webOrigin }
  { name: 'CORS_ORIGINS', value: webOrigin == defaultOrigin ? webOrigin : '${webOrigin},${defaultOrigin}' }
  { name: 'SERVICE_BUS_FQDN', value: serviceBusFqdn }
  { name: 'SERVICE_BUS_QUEUE', value: 'video-processing' }
  { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
]

resource api 'Microsoft.App/containerApps@2024-03-01' = if (deployServices) {
  name: apiName
  location: location
  identity: workloadIdentity
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: false, targetPort: 8000, transport: 'auto', allowInsecure: false }
      registries: registries
    }
    template: {
      containers: [{
        name: 'api'
        image: apiImage
        command: ['uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000', '--no-access-log']
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: commonEnv
        probes: [
          { type: 'Startup', httpGet: { path: '/health', port: 8000 }, periodSeconds: 10, failureThreshold: 30 }
          { type: 'Readiness', httpGet: { path: '/health', port: 8000 }, periodSeconds: 15 }
          { type: 'Liveness', tcpSocket: { port: 8000 }, periodSeconds: 30 }
        ]
      }]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

resource web 'Microsoft.App/containerApps@2024-03-01' = if (deployServices) {
  name: webName
  location: location
  identity: workloadIdentity
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
        // Keep the custom domain bound when this template is redeployed.
        customDomains: empty(publicHostname) || empty(publicHostnameCertificate) ? [] : [
          {
            name: publicHostname
            bindingType: 'SniEnabled'
            certificateId: '${environmentId}/managedCertificates/${publicHostnameCertificate}'
          }
        ]
      }
      registries: registries
    }
    template: {
      containers: [{
        name: 'web'
        image: '${acrLoginServer}/frameseek-web:${webImageTag}'
        resources: { cpu: json('0.25'), memory: '0.5Gi' }
        env: [{ name: 'API_UPSTREAM', value: 'https://${api.properties.configuration.ingress.fqdn}' }]
        probes: [
          { type: 'Readiness', httpGet: { path: '/', port: 8080 }, periodSeconds: 15 }
        ]
      }]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

resource worker 'Microsoft.App/jobs@2024-10-02-preview' = if (deployServices) {
  name: 'frameseek-worker'
  location: location
  identity: workloadIdentity
  properties: {
    environmentId: environmentId
    configuration: {
      triggerType: 'Event'
      replicaTimeout: 1800
      replicaRetryLimit: 1
      registries: registries
      eventTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
        scale: {
          minExecutions: 0
          maxExecutions: 3
          pollingInterval: 30
          rules: [{
            name: 'video-queue'
            type: 'azure-servicebus'
            metadata: { queueName: 'video-processing', namespace: replace(serviceBusFqdn, '.servicebus.windows.net', ''), messageCount: '1' }
            identity: identityId
          }]
        }
      }
    }
    template: {
      containers: [{
        name: 'worker'
        image: apiImage
        command: ['python', '-m', 'app.workers.consumer']
        resources: { cpu: json('2.0'), memory: '4Gi' }
        env: commonEnv
      }]
    }
  }
}

resource migrate 'Microsoft.App/jobs@2024-03-01' = {
  name: 'frameseek-migrate'
  location: location
  identity: workloadIdentity
  properties: {
    environmentId: environmentId
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 600
      replicaRetryLimit: 0
      registries: registries
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
    }
    template: {
      containers: [{
        name: 'migrate'
        image: apiImage
        command: ['alembic', 'upgrade', 'head']
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: commonEnv
      }]
    }
  }
}

output webUrl string = webOrigin
output googleCallbackUrl string = '${webOrigin}/api/v1/auth/google/callback'
