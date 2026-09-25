// Blob Storage — replaces GCS. Videos, frames and clips live in one account with
// separate containers. Browser uploads go direct-to-blob via user-delegation SAS.
param location string
param tags object
param namePrefix string
param resourceToken string

@description('Managed identity principal granted Storage Blob Data Contributor.')
param principalId string
param allowedOrigins array = []

resource account 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'st${namePrefix}${resourceToken}'
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: account
  name: 'default'
  properties: {
    cors: {
      corsRules: empty(allowedOrigins) ? [] : [
        {
          allowedOrigins: allowedOrigins
          allowedMethods: [ 'GET', 'PUT', 'HEAD' ]
          allowedHeaders: [ '*' ]
          exposedHeaders: [ '*' ]
          maxAgeInSeconds: 3600
        }
      ]
    }
  }
}

var containerNames = [
  'videos'
  'frames'
  'clips'
]

resource containers 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = [for name in containerNames: {
  parent: blobService
  name: name
  properties: {
    publicAccess: 'None'
  }
}]

var blobContributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')

resource blobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: account
  name: guid(account.id, principalId, blobContributorRoleId)
  properties: {
    roleDefinitionId: blobContributorRoleId
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

output accountName string = account.name
output blobEndpoint string = account.properties.primaryEndpoints.blob
