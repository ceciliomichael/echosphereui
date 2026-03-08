import { MessageList } from '../components/MessageList'
import { ChatInput } from '../components/ChatInput'
import { EmptyState } from '../components/EmptyState'
import { useChatMessages } from '../hooks/useChatMessages'

export function ChatInterface() {
  const { messages, sendMessage } = useChatMessages()

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#FCFCFD] px-4 md:px-5">
      <div className="chat-shell flex h-screen w-full flex-col">
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col pt-5 md:pt-6">
          {messages.length === 0 ? <EmptyState /> : <MessageList messages={messages} />}
        </div>

        <div className="flex-shrink-0 pb-5 pt-3 md:pb-6">
          <ChatInput onSend={sendMessage} />
        </div>
      </div>
    </div>
  )
}
