// Azure Database for PostgreSQL Flexible Server: managed backups (fixes the no-backup
// finding), VNet-private, with pgvector enabled (replaces Qdrant).
param location string
param tags object
param namePrefix string
param resourceToken string
param adminUser string

@secure()
param adminPassword string

@description('Subnet delegated to Microsoft.DBforPostgreSQL/flexibleServers.')
param delegatedSubnetId string

@description('Private DNS zone for the flexible server.')
param privateDnsZoneId string
param skuName string = 'Standard_D2ds_v5'
param skuTier string = 'GeneralPurpose'

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: 'psql-${namePrefix}-${resourceToken}'
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuTier
  }
  properties: {
    version: '16'
    administratorLogin: adminUser
    administratorLoginPassword: adminPassword
    storage: {
      storageSizeGB: 64
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: 14
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      delegatedSubnetResourceId: delegatedSubnetId
      privateDnsZoneArmResourceId: privateDnsZoneId
    }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: 'frameseek'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Allowlist pgvector so the extension can be created after deploy: CREATE EXTENSION vector;
resource extensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: server
  name: 'azure.extensions'
  properties: {
    value: 'VECTOR,UUID-OSSP,PG_TRGM'
    source: 'user-override'
  }
}

output fqdn string = server.properties.fullyQualifiedDomainName
output serverName string = server.name
output databaseName string = database.name
