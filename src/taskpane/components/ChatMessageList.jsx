import * as React from "react";
import ReactMarkdown from "react-markdown";
import ChatBubble from "@cloudscape-design/chat-components/chat-bubble";
import Avatar from "@cloudscape-design/chat-components/avatar";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Badge from "@cloudscape-design/components/badge";
import ModificationReview from "./ModificationReview";
import KBOptions from "./KBOptions";
import { renderTextWithLineBreaks } from "../microsoft-actions/utils";

const ChatMessageList = ({ messages, loading, pendingActions, onApplyModifications, documentHashWhenSent, onHashMismatch }) => {
  const [selectedKBOptions, setSelectedKBOptions] = React.useState({});
  
  return (
    <SpaceBetween size="s">
      {messages.map((msg, index) => {
        return (
          <React.Fragment key={index}>
          {/* Render tool usage indicator */}
          {msg.role === "tool_indicator" && (
            <Box textAlign="center" margin={{ vertical: "xs" }}>
              <Badge color="blue">
                🔧 Using {msg.tool_name}
              </Badge>
            </Box>
          )}
          
          {/* Render action history (acted-upon modifications) */}
          {msg.role === "action_history" && (() => {
            const hasKBOptions = msg.actions.some(action => 
              action.action === "none" && action.kb_options && action.kb_options.length > 0
            );
            const actionableModifications = msg.actions.filter(action => action.action !== "none");
            
            return (
              <SpaceBetween size="m">
                {/* Show KB options if present */}
                {hasKBOptions && msg.actions[0].kb_options && (
                  <Box color="text-status-inactive">
                    <SpaceBetween size="m">
                      <KBOptions
                        options={msg.actions[0].kb_options}
                        onChange={() => {}}
                        disabled={true}
                      />
                      {(() => {
                        const option = msg.actions[0].kb_options[0];
                        return (
                          <Box>
                            <Box fontWeight="bold">
                              Source: {option.doc} (Page {option.page})
                            </Box>
                            <Box variant="code">{renderTextWithLineBreaks(option.content)}</Box>
                          </Box>
                        );
                      })()}
                    </SpaceBetween>
                  </Box>
                )}
                
                {/* Show modification review if there are actionable modifications */}
                {actionableModifications.length > 0 && (
                  <ModificationReview
                    key={`action-history-${index}`}
                    modifications={actionableModifications}
                    onApply={() => {}}
                    disabled={true}
                    appliedIndices={msg.appliedIndices || []}
                    rejectedIndices={msg.rejectedIndices || (msg.rejected ? actionableModifications.map((_, i) => i) : [])}
                  />
                )}
              </SpaceBetween>
            );
          })()}
          
          {/* Only render ChatBubble if there's actual text content */}
          {msg.role !== "tool_indicator" && msg.role !== "action_history" && msg.content[0].text.trim() !== "" && (
            <ChatBubble
              type={msg.role === "user" ? "outgoing" : "incoming"}
              showLoadingBar={
                msg.role === "assistant" &&
                index === messages.length - 1 &&
                index > 0 &&
                loading
              }
              avatar={
                msg.role === "user" ? (
                  <Avatar ariaLabel="User" tooltipText="User" />
                ) : (
                  <Avatar
                    ariaLabel="Amazon Q"
                    color="gen-ai"
                    iconName="gen-ai"
                    tooltipText="Amazon Q"
                  />
                )
              }
            >
              <Box fontSize="body-m">
                <ReactMarkdown>{msg.content[0].text}</ReactMarkdown>
              </Box>
            </ChatBubble>
          )}
          </React.Fragment>
        );
      })}

      {/* Render pending actions separately */}
      {pendingActions && pendingActions.length > 0 && (() => {
        // Check if it's KB options only (action === "none" with kb_options)
        const hasKBOptions = pendingActions.some(action => 
          action.action === "none" && action.kb_options && action.kb_options.length > 0
        );
        
        // Filter out actionable modifications (not "none")
        const actionableModifications = pendingActions.filter(action => action.action !== "none");
        
        return (
          <SpaceBetween size="m">
            {/* Show KB options if present */}
            {hasKBOptions && pendingActions[0].kb_options && (
              <SpaceBetween size="m">
                <KBOptions
                  options={pendingActions[0].kb_options}
                  onChange={(selectedOption) => {
                    const selectedIndex = selectedOption ? parseInt(selectedOption.value) : 0;
                    setSelectedKBOptions({ pending: selectedIndex });
                  }}
                />
                {(() => {
                  const selectedIndex = selectedKBOptions.pending || 0;
                  const option = pendingActions[0].kb_options[selectedIndex];
                  return (
                    <Box>
                      <Box fontWeight="bold">
                        Source: {option.doc} (Page {option.page})
                      </Box>
                      <Box variant="code">{renderTextWithLineBreaks(option.content)}</Box>
                    </Box>
                  );
                })()}
              </SpaceBetween>
            )}
            
            {/* Show modification review if there are actionable modifications */}
            {actionableModifications.length > 0 && (
              <ModificationReview
                key="pending-modifications"
                modifications={actionableModifications}
                onApply={onApplyModifications}
                disabled={false}
                documentHashWhenSent={documentHashWhenSent}
                onHashMismatch={onHashMismatch}
              />
            )}
          </SpaceBetween>
        );
      })()}

      {loading && messages.length > 0 && messages[messages.length - 1].role === "user" && (
        <ChatBubble
          type="incoming"
          showLoadingBar
          avatar={
            <Avatar
              loading={true}
              color="gen-ai"
              iconName="gen-ai"
              ariaLabel="Amazon Q"
              tooltipText="Amazon Q"
            />
          }
        >
          <Box color="text-status-inactive" fontSize="body-s">Generating response</Box>
        </ChatBubble>
      )}
    </SpaceBetween>
  );
};

export default ChatMessageList;
