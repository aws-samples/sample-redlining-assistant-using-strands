import * as React from "react";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import TextContent from "@cloudscape-design/components/text-content";
import Alert from "@cloudscape-design/components/alert";
import { fetchUserAttributes } from "aws-amplify/auth";

// Import my components
import ChatInput from "./ChatInput";
import ChatMessageList from "./ChatMessageList";
import { useChatAPI } from "./useChatAPI";
import {
  getWordDocumentContent,
  getSelectedText,
  isDocumentEmpty,
} from "../taskpane";

// Simple hash function for document content
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

var INITIAL_MESSAGE = `**Hi there! I'm your AI-powered redlining assistant.**
\nAsk me about the Word document or tell me how you want to modify it! I can also search the knowledge base for reference material.
\n⚠️ **Important:** I'm just a drafting tool and can make mistakes. Always review my suggestions carefully.
\nHow can I help you today?`;

INITIAL_MESSAGE = {
  role: "assistant",
  content: [{ text: INITIAL_MESSAGE }],
};

export default ({ user, signOut }) => {
  const [messages, setMessages] = React.useState([INITIAL_MESSAGE]);
  const [loading, setLoading] = React.useState(false);
  
  // Track pending actions separately from messages
  const [pendingActions, setPendingActions] = React.useState([]);
  const pendingActionsRef = React.useRef([]);
  
  React.useEffect(() => {
    pendingActionsRef.current = pendingActions;
  }, [pendingActions]);

  // Get user attributes
  const [userAttributes, setUserAttributes] = React.useState(null);
  
  // Track document hash when message is sent
  const [documentHashWhenSent, setDocumentHashWhenSent] = React.useState(null);
  
  // Error message for alert
  const [errorMessage, setErrorMessage] = React.useState(null);

  React.useEffect(() => {
    const getUserAttributes = async () => {
      try {
        const attributes = await fetchUserAttributes();
        setUserAttributes(attributes);
      } catch (error) {
        console.error("Error fetching user attributes:", error);
      }
    };
    getUserAttributes();
  }, []);

  // Chat API for AgentCore Runtime
  const { sendMessage } = useChatAPI(user?.userId);

  const handleChatResponse = async (data) => {
    // Handle new event format
    if (data.type === 'content') {
      // Accumulate text chunks
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage && lastMessage.role === "assistant") {
          const currentText = lastMessage.content[0].text;
          const newChunk = data.data;

          // Append to existing assistant message
          return [
            ...prev.slice(0, -1),
            {
              ...lastMessage,
              content: [{ text: currentText + newChunk }],
            },
          ];
        } else {
          // Create new assistant message
          return [
            ...prev,
            {
              role: "assistant",
              content: [{ text: data.data }],
            },
          ];
        }
      });
    } else if (data.type === 'tool_use') {
      // Add tool usage indicator as a separate message-like item
      setMessages((prev) => [
        ...prev,
        {
          role: "tool_indicator",
          tool_name: data.tool_name
        }
      ]);
    } else if (data.type === 'microsoft_actions') {
      // Handle microsoft_actions event with parsed actions
      setPendingActions(data.actions || []);
    } else if (data.type === 'end_turn') {
      // Agent turn complete
      setLoading(false);
    }
  };

  const handleApplyModifications = async (appliedIndices, rejectedIndices) => {
    try {
      // Add action history as a new message
      setMessages((prev) => [
        ...prev,
        {
          role: "action_history",
          actions: pendingActions,
          actedUpon: true,
          appliedIndices: appliedIndices,
          rejectedIndices: rejectedIndices
        }
      ]);
      
      // Clear pending actions - useEffect will handle unregistering handlers
      setPendingActions([]);
      pendingActionsRef.current = [];
    } catch (error) {
      console.error("Error in handleApplyModifications:", error);
      setErrorMessage("An error occurred while applying modifications.");
    }
  };

  const handleSendMessage = async (inputValue) => {
    try {
      // Auto-reject pending actions when user sends new message
      if (pendingActions.length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            role: "action_history",
            actions: pendingActions,
            actedUpon: true,
            rejected: true
          }
        ]);
        setPendingActions([]);
        pendingActionsRef.current = [];
      }
      
      // Check if document is empty
      const isEmpty = await isDocumentEmpty();
      const documentContent = isEmpty ? "" : await getWordDocumentContent();
      const selectedText = await getSelectedText();
      
      // Hash document content when sending message
      const hash = simpleHash(documentContent);
      setDocumentHashWhenSent(hash);

      const newUserMessage = {
        role: "user",
        content: [{ text: inputValue }],
        word_document: documentContent,
        highlighted: selectedText,
      };

      // Display clean message in chat
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: [{ text: inputValue }],
        },
      ]);

      // Set loading state
      setLoading(true);

      // Send only the latest message (AgentCore Runtime maintains session state)
      const data = await sendMessage([newUserMessage], (response) => {
        // Handle SSE response
        handleChatResponse(response);
      });
    } catch (err) {
      setLoading(false);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: [{ text: "Error: " + err.message }],
        },
      ]);
    }
  };

  const handleReload = async () => {
    try {
      // Reload the taskpane
      window.location.reload();
    } catch (error) {
      console.error("Error during reload:", error);
    }
  };

  return (
    <SpaceBetween size="m">
      <div style={{ textAlign: "right" }}>
        <TextContent>
          <p>Hello {userAttributes?.given_name || "User"}!</p>
        </TextContent>
        <SpaceBetween size="xs">
          <Button onClick={signOut}>Sign out</Button>
          <Button onClick={handleReload} variant="inline-link">Reload Plugin</Button>
        </SpaceBetween>
      </div>
      
      {errorMessage && (
        <Alert
          type="error"
          dismissible
          onDismiss={() => setErrorMessage(null)}
        >
          {errorMessage}
        </Alert>
      )}
      
      <ChatMessageList 
        messages={messages} 
        loading={loading}
        pendingActions={pendingActions}
        onApplyModifications={handleApplyModifications}
        documentHashWhenSent={documentHashWhenSent}
        onHashMismatch={() => {
          setErrorMessage("Document has changed since your last message. Please send a new message to get updated modifications.");
          // Scroll to top to show the Flashbar
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
      <ChatInput onSendMessage={handleSendMessage} disabled={loading} />
    </SpaceBetween>
  );
};
