import { useState, useEffect, useRef } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { config } from "../../config";

export const useChatAPI = (userId) => {
  const [error, setError] = useState(null);
  const sessionIdRef = useRef(null);

  // Generate session ID on mount
  useEffect(() => {
    if (!userId) return;
    
    const randomPart = crypto.randomUUID().split('-')[0];
    const sessionId = `${userId}-${randomPart}`;
    sessionIdRef.current = sessionId;
  }, [userId]);

  const sendMessage = async (messages, onResponse) => {
    setError(null);

    try {
      // Get JWT token from Amplify
      const session = await fetchAuthSession();
      const jwtToken = session.tokens?.accessToken?.toString();
      
      if (!jwtToken) {
        throw new Error("No JWT token available");
      }

      const messageEvent = {
        messages: messages,
        timestamp: new Date().toISOString(),
      };

      const sessionId = sessionIdRef.current;

      const agentCoreEndpoint = `https://bedrock-agentcore.${config.region}.amazonaws.com/runtimes/${encodeURIComponent(config.agentCoreRuntimeArn)}/invocations`;

      // Make direct HTTPS POST to AgentCore endpoint
      const response = await fetch(agentCoreEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`,
          'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': sessionId,
        },
        body: JSON.stringify(messageEvent),
      });

      if (!response.ok) {
        throw new Error(`AgentCore request failed: ${response.status} ${response.statusText}`);
      }

      // Parse SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const eventData = line.slice(6); // Remove 'data: ' prefix
            
            try {
              const event = JSON.parse(eventData);
              // console.log('Received event:', event);
              
              // Call onResponse with parsed event
              if (onResponse) {
                onResponse(event);
              }
            } catch (parseError) {
              console.error('Failed to parse SSE event:', eventData, parseError);
            }
          }
        }
      }

      return { status: "sent" };
    } catch (err) {
      console.error("sendMessage error:", err);
      setError(err.message);
      throw err;
    }
  };

  return {
    sendMessage,
    error,
  };
};
