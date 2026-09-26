// AI Foundry models:
//  - Azure OpenAI (Whisper transcription): deployed in openAiLocation (Sweden Central by default).
//  - Azure AI Vision (multimodal image+text embeddings): replaces Vertex AI, in the primary region.
// Both reached via managed identity (Cognitive Services User); no API keys in app config.
param location string
param openAiLocation string
param tags object
param namePrefix string
param resourceToken string

@description('Managed identity principal granted Cognitive Services User.')
param principalId string

resource openai 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: 'oai-${namePrefix}-${resourceToken}'
  location: openAiLocation
  tags: tags
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: 'oai-${namePrefix}-${resourceToken}'
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: true
  }
}

resource whisper 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openai
  name: 'whisper'
  sku: {
    name: 'Standard'
    capacity: 1
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'whisper'
      version: '001'
    }
  }
}

resource vision 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: 'cv-${namePrefix}-${resourceToken}'
  location: location
  tags: tags
  kind: 'ComputerVision'
  sku: {
    name: 'S1'
  }
  properties: {
    customSubDomainName: 'cv-${namePrefix}-${resourceToken}'
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: true
  }
}

var cognitiveUserRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'a97b65f3-24c7-4388-baec-2e87135dc908')

resource openAiRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: openai
  name: guid(openai.id, principalId, cognitiveUserRoleId)
  properties: {
    roleDefinitionId: cognitiveUserRoleId
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

resource visionRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vision
  name: guid(vision.id, principalId, cognitiveUserRoleId)
  properties: {
    roleDefinitionId: cognitiveUserRoleId
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

output openAiEndpoint string = openai.properties.endpoint
output whisperDeployment string = whisper.name
output visionEndpoint string = vision.properties.endpoint
