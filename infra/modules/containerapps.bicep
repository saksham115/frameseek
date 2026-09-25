// Container Apps environment (VNet-integrated) hosting:
//  - the FastAPI API (external ingress, autoscaling)
//  - the video-processing worker as an event-triggered Job (KEDA scales on Service Bus depth),
//    which isolates the blocking ffmpeg/embedding/Whisper work into its own containers.
param location string
param tags object
param namePrefix string
param resourceToken string
param infraSubnetId string
param logAnalyticsCustomerId string
param logAnalyticsWorkspaceId string
param appInsightsConnectionString string
param identityId string
param identityClientId string
param acrLoginServer string
param apiImage string
param workerImage string
param serviceBusFqdn string
param serviceBusQueueName string
param keyVaultUri string

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${namePrefix}-${resourceToken}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: listKeys(logAnalyticsWorkspaceId, '2023-09-01').primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: infraSubnetId
      internal: false
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

var commonEnv = [
  {
    name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
    value: appInsightsConnectionString
  }
  {
    name: 'AZURE_CLIENT_ID'
    value: identityClientId
  }
  {
    name: 'AZURE_KEY_VAULT_URI'
    value: keyVaultUri
  }
  {
    name: 'SERVICE_BUS_FQDN'
    value: serviceBusFqdn
  }
  {
    name: 'SERVICE_BUS_QUEUE'
    value: serviceBusQueueName
  }
]

resource api 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-${namePrefix}-api-${resourceToken}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: acrLoginServer
          identity: identityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: apiImage
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          env: commonEnv
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 8000
              }
              periodSeconds: 30
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 10
        rules: [
          {
            name: 'http-scale'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

resource worker 'Microsoft.App/jobs@2024-10-02-preview' = {
  name: 'caj-${namePrefix}-worker-${resourceToken}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityId}': {}
    }
  }
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Event'
      replicaTimeout: 1800
      replicaRetryLimit: 1
      registries: [
        {
          server: acrLoginServer
          identity: identityId
        }
      ]
      eventTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
        scale: {
          minExecutions: 0
          maxExecutions: 10
          pollingInterval: 30
          rules: [
            {
              name: 'servicebus-scale'
              type: 'azure-servicebus'
              metadata: {
                queueName: serviceBusQueueName
                namespace: replace(serviceBusFqdn, '.servicebus.windows.net', '')
                messageCount: '1'
              }
              identity: identityId
            }
          ]
        }
      }
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: workerImage
          resources: {
            cpu: json('2.0')
            memory: '4Gi'
          }
          env: commonEnv
        }
      ]
    }
  }
}

output apiFqdn string = api.properties.configuration.ingress.fqdn
output environmentId string = env.id
