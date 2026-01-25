import React, { useState, useCallback } from "react";

interface DataverseAPIDemoProps {
  connection: ToolBoxAPI.DataverseConnection | null;
  onLog: (message: string, type?: "info" | "success" | "warning" | "error") => void;
}

export const DataverseAPIDemo: React.FC<DataverseAPIDemoProps> = ({ connection, onLog }) => {
  const [accountName, setAccountName] = useState("Sample Account");
  const [createdAccountId, setCreatedAccountId] = useState<string | null>(null);
  const [queryOutput, setQueryOutput] = useState("");
  const [crudOutput, setCrudOutput] = useState("");
  const [metadataOutput, setMetadataOutput] = useState("");
  const [executeOutput, setExecuteOutput] = useState("");

  const showNotification = useCallback(
    async (title: string, body: string, type: "success" | "info" | "warning" | "error") => {
      try {
        await window.toolboxAPI.utils.showNotification({ title, body, type, duration: 3000 });
      } catch (error) {
        console.error("Error showing notification:", error);
      }
    },
    [],
  );

  const queryAccounts = useCallback(async () => {
    if (!connection) {
      await showNotification("No Connection", "Please connect to a Dataverse environment", "warning");
      return;
    }

    try {
      setQueryOutput("Querying accounts... with fetchXml\n");

      const fetchXml = `
<fetch top="10">
  <entity name="account">
    <attribute name="name" />
    <attribute name="accountid" />
    <attribute name="emailaddress1" />
    <attribute name="telephone1" />
    <order attribute="name" />
  </entity>
</fetch>
            `.trim();
      setQueryOutput("Using FetchXML:\n" + fetchXml + "\n\n");
      const result = await window.dataverseAPI.fetchXmlQuery(fetchXml);

      let output = `Found ${result.value.length} account(s):\n\n`;
      result.value.forEach((account: any, index: number) => {
        output += `${index + 1}. ${account.name}\n`;
        output += `   ID: ${account.accountid}\n`;
        if (account.emailaddress1) output += `   Email: ${account.emailaddress1}\n`;
        if (account.telephone1) output += `   Phone: ${account.telephone1}\n`;
        output += "\n";
      });

      setQueryOutput(output);
      onLog(`Queried ${result.value.length} accounts`, "success");
    } catch (error) {
      const errorMsg = `Error: ${(error as Error).message}`;
      setQueryOutput(errorMsg);
      onLog(`Error querying accounts: ${(error as Error).message}`, "error");
    }
  }, [connection, onLog, showNotification]);

  const queryContactQueryData = useCallback(async () => {
    if (!connection) {
      await showNotification("No Connection", "Please connect to a Dataverse environment", "warning");
      return;
    }
    try {
      setQueryOutput("Querying contacts... with QueryData\n");
      const queryString = "contacts?$top=10&$select=fullname,contactid,emailaddress1,telephone1&$orderby=fullname asc";
      setQueryOutput("Using QueryData:\n" + queryString + "\n\n");

      const result = await window.dataverseAPI.queryData(queryString);
      let output = `Found ${result.value.length} contact(s):\n\n`;
      result.value.forEach((contact: any, index: number) => {
        output += `${index + 1}. ${contact.fullname}\n`;
        output += `   ID: ${contact.contactid}\n`;
        if (contact.emailaddress1) output += `   Email: ${contact.emailaddress1}\n`;
        if (contact.telephone1) output += `   Phone: ${contact.telephone1}\n`;
        output += "\n";
      });

      setQueryOutput(output);
      onLog(`Queried ${result.value.length} contacts`, "success");
    } catch (error) {
      const errorMsg = `Error: ${(error as Error).message}`;
      setQueryOutput(errorMsg);
      onLog(`Error querying contacts: ${(error as Error).message}`, "error");
    }
  }, [connection, onLog, showNotification]);

  const executeWhoAmI = useCallback(async () => {
    if (!connection) {
      await showNotification("No Connection", "Please connect to a Dataverse environment", "warning");
      return;
    }
    try {
      setExecuteOutput("Executing WhoAmI request...\n");
      const result = await window.dataverseAPI.execute({ operationName: "WhoAmI", operationType: "function" });

      setExecuteOutput(
        `WhoAmI Result:\n\nUser ID: ${result.UserId}\nBusiness Unit ID: ${result.BusinessUnitId}\nOrganization ID: ${result.OrganizationId}\n`,
      );
      onLog("WhoAmI executed successfully", "success");
    } catch (error) {
      const errorMsg = `Error: ${(error as Error).message}`;
      setExecuteOutput(errorMsg);
      onLog(`Error executing WhoAmI: ${(error as Error).message}`, "error");
    }
  }, [connection, onLog, showNotification]);

  const createAccount = useCallback(async () => {
    if (!connection) {
      await showNotification("No Connection", "Please connect to a Dataverse environment", "warning");
      return;
    }

    try {
      setCrudOutput("Creating account...\n");

      const result = await window.dataverseAPI.create("account", {
        name: accountName,
        emailaddress1: "sample@example.com",
        telephone1: "555-0100",
        description: "Created by React Sample Tool",
      });

      setCreatedAccountId(result.id);

      const output = `Account created successfully!\n\nID: ${result.id}\nName: ${accountName}\n`;
      setCrudOutput(output);

      await showNotification("Account Created", `Account "${accountName}" created successfully`, "success");
      onLog(`Account created: ${result.id}`, "success");
    } catch (error) {
      const errorMsg = `Error: ${(error as Error).message}`;
      setCrudOutput(errorMsg);
      onLog(`Error creating account: ${(error as Error).message}`, "error");
    }
  }, [connection, accountName, onLog, showNotification]);

  const updateAccount = useCallback(async () => {
    if (!createdAccountId) {
      await showNotification("No Account", "Please create an account first", "warning");
      return;
    }

    try {
      setCrudOutput("Updating account...\n");

      await window.dataverseAPI.update("account", createdAccountId, {
        description: "Updated by React Sample Tool at " + new Date().toISOString(),
        telephone1: "555-0200",
      });

      const output = `Account updated successfully!\n\nID: ${createdAccountId}\nUpdated fields: description, telephone1\n`;
      setCrudOutput(output);

      await showNotification("Account Updated", "Account updated successfully", "success");
      onLog(`Account updated: ${createdAccountId}`, "success");
    } catch (error) {
      const errorMsg = `Error: ${(error as Error).message}`;
      setCrudOutput(errorMsg);
      onLog(`Error updating account: ${(error as Error).message}`, "error");
    }
  }, [createdAccountId, onLog, showNotification]);

  const deleteAccount = useCallback(async () => {
    if (!createdAccountId) {
      await showNotification("No Account", "Please create an account first", "warning");
      return;
    }

    try {
      setCrudOutput("Deleting account...\n");

      await window.dataverseAPI.delete("account", createdAccountId);

      const output = `Account deleted successfully!\n\nID: ${createdAccountId}\n`;
      setCrudOutput(output);

      await showNotification("Account Deleted", "Account deleted successfully", "success");
      onLog(`Account deleted: ${createdAccountId}`, "success");
      setCreatedAccountId(null);
    } catch (error) {
      const errorMsg = `Error: ${(error as Error).message}`;
      setCrudOutput(errorMsg);
      onLog(`Error deleting account: ${(error as Error).message}`, "error");
    }
  }, [createdAccountId, onLog, showNotification]);

  const getAccountMetadata = useCallback(async () => {
    if (!connection) {
      await showNotification("No Connection", "Please connect to a Dataverse environment", "warning");
      return;
    }

    try {
      setMetadataOutput("Retrieving metadata...\n");

      const metadata = await window.dataverseAPI.getEntityMetadata("account", true);
      let output = "Account Entity Metadata:\n\n";
      output += `Logical Name: ${metadata.LogicalName}\n`;
      output += `Metadata ID: ${metadata.MetadataId}\n`;
      output += `Display Name: ${metadata.DisplayName?.LocalizedLabels?.[0]?.Label || "N/A"}\n`;

      setMetadataOutput(output);
      onLog("Account metadata retrieved", "success");
    } catch (error) {
      const errorMsg = `Error: ${(error as Error).message}`;
      setMetadataOutput(errorMsg);
      onLog(`Error getting metadata: ${(error as Error).message}`, "error");
    }
  }, [connection, onLog, showNotification]);

  const getContactFields = useCallback(async () => {
    if (!connection) {
      await showNotification("No Connection", "Please connect to a Dataverse environment", "warning");
      return;
    }

    try {
      setMetadataOutput("Retrieving Contact Attributes metadata...\n");

      const metadata = await window.dataverseAPI.getEntityRelatedMetadata("contact", "Attributes", [
        "LogicalName",
        "DisplayName",
        "AttributeType",
      ]);
      let output = "Contact Attributes:\n\n";

      metadata.value.forEach((attr: any) => {
        output += `Logical Name: ${attr.LogicalName}, Type: ${attr.AttributeType}, Display Name: ${attr.DisplayName?.LocalizedLabels?.[0]?.Label || "N/A"}\n`;
      });

      setMetadataOutput(output);
      onLog("Contact attributes metadata retrieved", "success");
    } catch (error) {
      const errorMsg = `Error: ${(error as Error).message}`;
      setMetadataOutput(errorMsg);
      onLog(`Error getting metadata: ${(error as Error).message}`, "error");
    }
  }, [connection, onLog, showNotification]);

  const getAllEntitiesMetadata = useCallback(async () => {
    if (!connection) {
      await showNotification("No Connection", "Please connect to a Dataverse environment", "warning");
      return;
    }
    try {
      setMetadataOutput("Retrieving all entities metadata...\n");
      const metadata = await window.dataverseAPI.getAllEntitiesMetadata();
      let output = `Total Entities: ${metadata.value.length}\n\n`;
      metadata.value.forEach((entity: any) => {
        output += `Logical Name: ${entity.LogicalName}, Display Name: ${entity.DisplayName?.LocalizedLabels?.[0]?.Label || "N/A"}\n`;
      });
      setMetadataOutput(output);
      onLog("All entities metadata retrieved", "success");
    } catch (error) {
      const errorMsg = `Error: ${(error as Error).message}`;
      setMetadataOutput(errorMsg);
      onLog(`Error getting all entities metadata: ${(error as Error).message}`, "error");
    }
  }, [connection, onLog, showNotification]);

  return (
    <div className="card">
      <h2>💾 Dataverse API Examples</h2>

      <div className="example-group">
        <h3>Query Records</h3>
        <button onClick={queryAccounts} className="btn">
          Query Top 10 Accounts (FetchXML)
        </button>
        <button onClick={queryContactQueryData} className="btn">
          Query Top 10 Contacts (QueryData)
        </button>
        <div className="output">{queryOutput}</div>
      </div>

      <div className="example-group">
        <h3>CRUD Operations</h3>
        <div className="input-group">
          <label htmlFor="account-name">Account Name:</label>
          <input
            type="text"
            id="account-name"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="Enter account name"
          />
        </div>
        <div className="button-group">
          <button onClick={createAccount} className="btn btn-primary">
            Create Account
          </button>
          <button onClick={updateAccount} className="btn" disabled={!createdAccountId}>
            Update Account
          </button>
          <button onClick={deleteAccount} className="btn btn-error" disabled={!createdAccountId}>
            Delete Account
          </button>
        </div>
        <div className="output">{crudOutput}</div>
      </div>

      <div className="example-group">
        <h3>Metadata</h3>
        <button onClick={getAccountMetadata} className="btn">
          Get Account Metadata
        </button>
        <button onClick={getContactFields} className="btn">
          Get Contact Attributes Metadata
        </button>
        <button onClick={getAllEntitiesMetadata} className="btn">
          Get All Entities Metadata
        </button>
        <div className="output">{metadataOutput}</div>
      </div>

      <div className="example-group">
        <h3>Execute</h3>
        <button onClick={executeWhoAmI} className="btn">
          WhoAmI
        </button>
        <div className="output">{executeOutput}</div>
      </div>
    </div>
  );
};
