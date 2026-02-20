import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext';

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' ? window.MY_GLOBAL_CONFIG?.apiUrl : '') ||
  'http://localhost:4000'
).replace(/\/+$/, '');
const POLL_FALLBACK_MS = 30000;
const DEBUG_MESSAGING = import.meta.env.DEV || import.meta.env.VITE_DEBUG_MESSAGING === 'true';

function logMessaging(...args) {
  if (DEBUG_MESSAGING) console.debug('[MessagingPage]', ...args);
}

function logMessagingError(...args) {
  if (DEBUG_MESSAGING) console.error('[MessagingPage]', ...args);
}

async function parseJsonResponse(res) {
  const raw = await res.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_) {
    return { success: false, message: 'Invalid JSON response', raw };
  }
}

function extractConversation(payload) {
  if (payload && typeof payload === 'object') {
    if (payload.conversation && typeof payload.conversation === 'object') return payload.conversation;
    if (payload.data?.conversation && typeof payload.data.conversation === 'object') return payload.data.conversation;
    if (payload.data && payload.data.id) return payload.data;
  }
  return null;
}

function extractMessages(payload) {
  if (Array.isArray(payload?.messages)) return payload.messages;
  if (Array.isArray(payload?.data?.messages)) return payload.data.messages;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

/* ------------------------------------------------------------------ */
/* EAZY PASS Colour Palette                                             */
/* ------------------------------------------------------------------ */
const C = {
  obsidian:     '#0B0B0E',
  darkSurface:  '#131316',
  cardBg:       '#1A1A1F',
  violet:       '#1A103F',
  gold:         '#E0B56F',
  champagne:    '#F5D18C',
  goldMuted:    '#A8935A',
  goldDark:     '#8B7740',
  textPrimary:  '#F0ECE3',
  textSecondary:'#9B9484',
  border:       '#2A2A30',
  inputBg:      '#1E1E24',
  sent:         '#2A2530',      // user bubble
  received:     '#1A1A1F',      // partner bubble
  readTick:     '#E0B56F',      // gold ticks for read
  danger:       '#D44040',
};

/* ------------------------------------------------------------------ */
/* Tick indicators (WhatsApp-style, gold theme)                         */
/* ------------------------------------------------------------------ */
const StatusTicks = ({ status }) => {
  if (!status || status === 'sent') {
    return <span style={{ fontSize: '0.65rem', color: C.goldMuted, marginLeft: 4 }}>✓</span>;
  }
  if (status === 'delivered') {
    return <span style={{ fontSize: '0.65rem', color: C.goldMuted, marginLeft: 4 }}>✓✓</span>;
  }
  return <span style={{ fontSize: '0.65rem', color: C.readTick, marginLeft: 4 }}>✓✓</span>;
};

/* ------------------------------------------------------------------ */
/* Date separator                                                       */
/* ------------------------------------------------------------------ */
const DateSeparator = ({ date }) => {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let label;
  if (d.toDateString() === today.toDateString()) label = 'Today';
  else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday';
  else label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div style={s.dateSep}>
      <span style={s.dateSepLabel}>{label}</span>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Conversations List                                                  */
/* ------------------------------------------------------------------ */
const ConversationList = ({ conversations, onSelect, selectedId, loading }) => {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div style={s.emptyWrap}>
        <div style={s.spinner} />
        <p style={{ color: C.textSecondary, marginTop: '0.75rem' }}>Loading chats...</p>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div style={s.emptyWrap}>
        <span style={{ fontSize: '2.5rem' }}>💬</span>
        <p style={{ fontWeight: 600, color: C.textPrimary, margin: '0.75rem 0 0.25rem' }}>No conversations yet</p>
        <p style={{ color: C.textSecondary, fontSize: '0.85rem', maxWidth: '260px' }}>
          Visit a venue page and start a chat with the restaurant!
        </p>
        <button onClick={() => navigate('/home')} style={s.ctaBtn}>Browse Venues</button>
      </div>
    );
  }

  return (
    <div style={s.convList}>
      {conversations.map((conv) => {
        const unread = parseInt(conv.unread_count || 0, 10);
        const isSelected = selectedId === conv.id;
        return (
          <div
            key={conv.id}
            onClick={() => onSelect(conv)}
            style={{
              ...s.convRow,
              background: isSelected ? C.violet : C.darkSurface,
              borderLeft: isSelected ? `3px solid ${C.gold}` : '3px solid transparent',
            }}
          >
            <div style={s.convAvatar}>
              {conv.partner_name?.charAt(0)?.toUpperCase() || '🏪'}
            </div>
            <div style={s.convInfo}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ ...s.convName, fontWeight: unread > 0 ? 700 : 500, color: unread > 0 ? C.champagne : C.textPrimary }}>
                  {conv.partner_name || 'Venue'}
                </div>
                {conv.last_message_at && (
                  <div style={{ ...s.convTime, color: unread > 0 ? C.gold : C.textSecondary }}>
                    {formatConvTime(conv.last_message_at)}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ ...s.convPreview, fontWeight: unread > 0 ? 600 : 400, color: unread > 0 ? C.textPrimary : C.textSecondary }}>
                  {conv.last_message_sender === 'user' && 'You: '}
                  {conv.last_message || 'Start a conversation...'}
                </div>
                {unread > 0 && (
                  <span style={s.unreadBadge}>{unread > 99 ? '99+' : unread}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

function formatConvTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/* ------------------------------------------------------------------ */
/* Chat View                                                           */
/* ------------------------------------------------------------------ */
const ChatView = ({ conversation, token, onBack, onMessagesRead }) => {
  const { socketConnected } = useNotifications();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [longPressMsg, setLongPressMsg] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const listRef = useRef(null);
  const longPressTimer = useRef(null);
  const conversationId = conversation?.id;
  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token]
  );

  const loadMessages = useCallback(async () => {
    if (!conversationId || !token) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const url = `${API_BASE}/api/v1/conversations/${conversationId}/messages`;
    logMessaging('loadMessages()', { conversationId, url });
    try {
      const res = await fetch(url, { headers: authHeaders() });
      const payload = await parseJsonResponse(res);
      logMessaging('loadMessages() response', { conversationId, status: res.status, payload });

      if (res.ok && payload?.success) {
        const nextMessages = extractMessages(payload);
        setMessages(nextMessages);
        logMessaging('messages state updated', { conversationId, count: nextMessages.length });
      } else {
        setMessages([]);
      }
    } catch (error) {
      logMessagingError('loadMessages() failed', { conversationId, error });
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, conversationId, token]);

  const markRead = useCallback(async () => {
    if (!conversationId || !token) return;
    const url = `${API_BASE}/api/v1/conversations/${conversationId}/read`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: authHeaders(),
      });
      const payload = await parseJsonResponse(res);
      logMessaging('markRead() response', { conversationId, status: res.status, payload });
      if (res.ok && onMessagesRead) onMessagesRead();
    } catch (error) {
      logMessagingError('markRead() failed', { conversationId, error });
    }
  }, [authHeaders, conversationId, onMessagesRead, token]);

  useEffect(() => {
    loadMessages();
    markRead();
  }, [loadMessages, markRead]);

  useEffect(() => {
    const onMessageReceived = (e) => {
      const payload = e.detail || {};
      if (payload.conversationId === conversationId) {
        loadMessages();
      }
    };
    window.addEventListener('elizian-message-received', onMessageReceived);
    return () => window.removeEventListener('elizian-message-received', onMessageReceived);
  }, [conversationId, loadMessages]);

  useEffect(() => {
    if (!conversationId) return;
    if (socketConnected) return;
    const interval = setInterval(() => {
      loadMessages();
      markRead();
    }, POLL_FALLBACK_MS);
    return () => clearInterval(interval);
  }, [conversationId, loadMessages, markRead, socketConnected]);

  const prevMsgCount = useRef(0);
  useEffect(() => {
    if (listRef.current && messages.length > prevMsgCount.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    prevMsgCount.current = messages.length;
  }, [messages]);

  const sendMessage = async () => {
    if (!conversationId || !token || !input.trim() || sending) return;
    const text = input.trim();
    setSending(true);
    setInput('');
    const optimistic = {
      id: 'temp-' + Date.now(),
      sender_type: 'user', body: text,
      created_at: new Date().toISOString(),
      status: 'sent', _sending: true,
    };
    setMessages(prev => [...prev, optimistic]);
    try {
      const url = `${API_BASE}/api/v1/conversations/${conversationId}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ body: text }),
      });
      const payload = await parseJsonResponse(res);
      logMessaging('sendMessage() response', { conversationId, status: res.status, payload });

      if (res.ok && payload?.success) {
        const persisted = payload?.data || optimistic;
        setMessages(prev => prev.map(m => m.id === optimistic.id ? persisted : m));
      } else {
        setMessages(prev => prev.filter(m => m.id !== optimistic.id));
        setInput(text);
      }
    } catch (error) {
      logMessagingError('sendMessage() failed', { conversationId, error });
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // Long-press to show delete popup (mobile)
  const handleMsgTouchStart = (msg) => {
    if (msg.sender_type !== 'user' || msg._sending) return;
    longPressTimer.current = setTimeout(() => setLongPressMsg(msg), 500);
  };
  const handleMsgTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const deleteMessage = async (msgId) => {
    if (!conversationId || !token || !msgId) return;
    setDeleting(true);
    try {
      const url = `${API_BASE}/api/v1/conversations/${conversationId}/messages/${msgId}`;
      const res = await fetch(url, { method: 'DELETE', headers: authHeaders() });
      const payload = await parseJsonResponse(res);
      logMessaging('deleteMessage() response', { conversationId, messageId: msgId, status: res.status, payload });

      if (res.ok && payload?.success) {
        setMessages(prev => prev.filter(m => m.id !== msgId));
      } else {
        alert(payload?.message || 'Cannot delete this message');
      }
    } catch (error) {
      logMessagingError('deleteMessage() failed', { conversationId, messageId: msgId, error });
      alert('Failed to delete message');
    } finally {
      setDeleting(false);
      setLongPressMsg(null);
    }
  };

  // Group messages by date
  const groupedMessages = [];
  let lastDate = '';
  messages.forEach((msg) => {
    const msgDate = new Date(msg.created_at).toDateString();
    if (msgDate !== lastDate) {
      groupedMessages.push({ type: 'date', date: msg.created_at });
      lastDate = msgDate;
    }
    groupedMessages.push({ type: 'msg', msg });
  });

  return (
    <div style={s.chatWrap}>
      {/* Chat header */}
      <div style={s.chatHeader}>
        <button onClick={onBack} style={s.chatBackBtn} aria-label="Back">←</button>
        <div style={s.chatHeaderAvatar}>
          {conversation.partner_name?.charAt(0)?.toUpperCase() || '🏪'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={s.chatHeaderName}>{conversation.partner_name || 'Venue'}</div>
          <div style={s.chatHeaderSub}>
            {loading ? 'loading...' : 'tap for venue info'}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={listRef} style={s.messageList}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: C.textSecondary }}>
            <div style={{ ...s.spinner, margin: '0 auto 0.5rem' }} />
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: C.textSecondary }}>
            <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>👋</p>
            <p style={{ fontWeight: 600, color: C.champagne }}>Start the conversation!</p>
            <p style={{ fontSize: '0.8rem' }}>Ask about reservations, menu specials, or anything else.</p>
          </div>
        ) : (
          groupedMessages.map((item, i) => {
            if (item.type === 'date') {
              return <DateSeparator key={'d-' + i} date={item.date} />;
            }
            const msg = item.msg;
            const isUser = msg.sender_type === 'user';
            const canDelete = isUser && !msg._sending && msg.status && msg.status !== 'read';
            return (
              <div
                key={msg.id || i}
                style={{ ...s.msgRow, justifyContent: isUser ? 'flex-end' : 'flex-start' }}
                onTouchStart={() => handleMsgTouchStart(msg)}
                onTouchEnd={handleMsgTouchEnd}
                onContextMenu={(e) => {
                  if (isUser && !msg._sending) { e.preventDefault(); setLongPressMsg(msg); }
                }}
              >
                <div style={{
                  ...s.msgBubble,
                  position: 'relative',
                  background: isUser
                    ? `linear-gradient(135deg, ${C.violet}, ${C.sent})`
                    : C.received,
                  color: C.textPrimary,
                  borderBottomRightRadius: isUser ? '4px' : '14px',
                  borderBottomLeftRadius: isUser ? '14px' : '4px',
                  border: isUser ? `1px solid rgba(224,181,111,0.15)` : `1px solid ${C.border}`,
                  opacity: msg._sending ? 0.6 : 1,
                }}>
                  <div style={{ lineHeight: 1.5 }}>{msg.body}</div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2, marginTop: 3 }}>
                    <span style={{ fontSize: '0.6rem', color: C.textSecondary }}>
                      {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                    {isUser && <StatusTicks status={msg.status} />}
                  </div>
                  {/* Delete button — visible on user's own unread messages */}
                  {canDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setLongPressMsg(msg); }}
                      title="Delete message"
                      style={{
                        position: 'absolute', top: -7, right: -7,
                        width: 20, height: 20, borderRadius: '50%',
                        background: C.danger, color: '#fff', border: `1px solid ${C.obsidian}`,
                        fontSize: '0.6rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: 0.85, transition: 'opacity 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '0.85'}
                    >✕</button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Delete confirmation popup */}
      {longPressMsg && (
        <div style={s.deleteOverlay} onClick={() => setLongPressMsg(null)}>
          <div style={s.deletePopup} onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: '0.85rem', color: C.textPrimary, marginBottom: '0.75rem' }}>
              {longPressMsg.status === 'read'
                ? 'This message has been read and cannot be deleted.'
                : 'Delete this message? It will be removed for everyone.'}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setLongPressMsg(null)} style={s.deleteCancel}>Cancel</button>
              {longPressMsg.status !== 'read' && (
                <button
                  onClick={() => deleteMessage(longPressMsg.id)}
                  disabled={deleting}
                  style={s.deleteConfirm}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div style={s.inputBar}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          style={s.inputField}
          rows={1}
          maxLength={2000}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          style={{ ...s.sendBtn, opacity: (!input.trim() || sending) ? 0.4 : 1 }}
          aria-label="Send"
        >
          {sending ? '...' : '➤'}
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Main Page                                                           */
/* ------------------------------------------------------------------ */
const MessagingPage = () => {
  const navigate = useNavigate();
  const { partnerId, conversationId } = useParams();
  const { socketConnected } = useNotifications();
  const token = localStorage.getItem('token');
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [loading, setLoading] = useState(true);

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token]
  );

  const loadConversations = useCallback(async () => {
    if (!token) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const url = `${API_BASE}/api/v1/conversations`;
    logMessaging('loadConversations()', { url });
    try {
      const res = await fetch(url, { headers: authHeaders() });
      const payload = await parseJsonResponse(res);
      logMessaging('loadConversations() response', { status: res.status, payload });

      if (res.ok && payload?.success) {
        const list = Array.isArray(payload.data) ? payload.data : [];
        setConversations(list);
      } else {
        setConversations([]);
      }
    } catch (error) {
      logMessagingError('loadConversations() failed', { error });
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, token]);

  const openPartnerConversation = useCallback(async (pid) => {
    if (!pid || !token) return;
    const url = `${API_BASE}/api/v1/partners/${pid}/conversations/me`;
    logMessaging('openPartnerConversation()', { partnerId: pid, url });
    try {
      const res = await fetch(url, { headers: authHeaders() });
      const payload = await parseJsonResponse(res);
      logMessaging('openPartnerConversation() response', { partnerId: pid, status: res.status, payload });
      if (res.ok && payload?.success && payload?.data) setSelectedConv(payload.data);
    } catch (error) {
      logMessagingError('openPartnerConversation() failed', { partnerId: pid, error });
    }
  }, [authHeaders, token]);

  const openConversationById = useCallback(async (cid) => {
    if (!cid || !token) return;
    logMessaging('openConversationById()', { conversationId: cid });

    const existing = conversations.find((conv) => String(conv.id) === String(cid));
    if (existing) {
      setSelectedConv(existing);
      return;
    }

    const url = `${API_BASE}/api/messages/${cid}`;
    try {
      const res = await fetch(url, { headers: authHeaders() });
      const payload = await parseJsonResponse(res);
      logMessaging('openConversationById() response', { conversationId: cid, status: res.status, payload });
      if (!res.ok || !payload?.success) return;

      const conv = extractConversation(payload);
      if (conv) setSelectedConv(conv);

      const msgList = extractMessages(payload);
      logMessaging('openConversationById() messages', { conversationId: cid, count: msgList.length });
    } catch (error) {
      logMessagingError('openConversationById() failed', { conversationId: cid, error });
    }
  }, [authHeaders, conversations, token]);

  useEffect(() => {
    logMessaging('route params', { partnerId, conversationId });
  }, [partnerId, conversationId]);

  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    loadConversations();
  }, [loadConversations, navigate, token]);

  useEffect(() => {
    const onMessageReceived = (e) => {
      const payload = e.detail || {};
      logMessaging('elizian-message-received event', payload);
      if (!selectedConv) loadConversations();
    };
    window.addEventListener('elizian-message-received', onMessageReceived);
    return () => window.removeEventListener('elizian-message-received', onMessageReceived);
  }, [loadConversations, selectedConv]);

  useEffect(() => {
    if (!token) return;
    if (socketConnected) return;
    const interval = setInterval(() => {
      if (!selectedConv) loadConversations();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadConversations, selectedConv, socketConnected, token]);

  useEffect(() => {
    if (partnerId && token) openPartnerConversation(partnerId);
  }, [openPartnerConversation, partnerId, token]);

  useEffect(() => {
    if (!conversationId || !token || selectedConv) return;
    openConversationById(conversationId);
  }, [conversationId, openConversationById, selectedConv, token]);

  useEffect(() => {
    if (!selectedConv || conversations.length === 0) return;
    const refreshed = conversations.find((conv) => String(conv.id) === String(selectedConv.id));
    if (refreshed) setSelectedConv(refreshed);
  }, [conversations, selectedConv]);

  if (selectedConv) {
    return (
      <ChatView
        conversation={selectedConv}
        token={token}
        onBack={() => { setSelectedConv(null); loadConversations(); }}
        onMessagesRead={loadConversations}
      />
    );
  }

  return (
    <div style={s.page}>
      <div style={s.container}>
        <div style={s.header}>
          <button onClick={() => navigate(-1)} style={s.backBtn}>← Back</button>
          <h1 style={s.headerTitle}>Messages</h1>
          <div style={{ width: '60px' }} />
        </div>
        <ConversationList
          conversations={conversations}
          onSelect={setSelectedConv}
          selectedId={selectedConv?.id}
          loading={loading}
        />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Styles — EAZY PASS Dark Gold Theme                                  */
/* ------------------------------------------------------------------ */
const s = {
  page: { minHeight: '100vh', background: C.obsidian, paddingBottom: '5rem' },
  container: { maxWidth: '480px', margin: '0 auto', padding: '0' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.75rem 1rem',
    background: `linear-gradient(135deg, ${C.obsidian}, ${C.violet})`,
    borderBottom: `1px solid ${C.border}`,
  },
  backBtn: { background: 'none', border: 'none', color: C.gold, fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' },
  headerTitle: { fontSize: '1.1rem', fontWeight: 700, color: C.champagne, margin: 0, letterSpacing: '0.05em' },

  emptyWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', textAlign: 'center', padding: '2rem' },
  spinner: { width: '28px', height: '28px', border: `3px solid ${C.border}`, borderTop: `3px solid ${C.gold}`, borderRadius: '50%', animation: 'spin 1s linear infinite' },
  ctaBtn: {
    marginTop: '1rem', padding: '0.7rem 1.5rem',
    background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
    color: C.obsidian, border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer',
    letterSpacing: '0.03em',
  },

  /* Conversation list */
  convList: { background: C.darkSurface },
  convRow: {
    display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem',
    borderBottom: `1px solid ${C.border}`, cursor: 'pointer', transition: 'background 0.15s',
  },
  convAvatar: {
    width: '48px', height: '48px', borderRadius: '50%',
    background: `linear-gradient(135deg, ${C.violet}, ${C.goldDark})`,
    color: C.champagne, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: '1.1rem', flexShrink: 0,
    border: `1.5px solid ${C.gold}`,
  },
  convInfo: { flex: 1, minWidth: 0 },
  convName: { fontSize: '0.95rem' },
  convPreview: { fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 },
  convTime: { fontSize: '0.7rem', flexShrink: 0 },
  unreadBadge: {
    background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
    color: C.obsidian, fontSize: '0.65rem', fontWeight: 800,
    minWidth: '18px', height: '18px', borderRadius: '9px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 5px', flexShrink: 0,
  },

  /* Chat */
  chatWrap: {
    display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, maxWidth: '480px', margin: '0 auto',
    background: C.obsidian,
  },
  chatHeader: {
    display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.75rem',
    background: `linear-gradient(135deg, ${C.obsidian}, ${C.violet})`,
    borderBottom: `1px solid ${C.border}`, flexShrink: 0,
  },
  chatBackBtn: { background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: C.gold, fontWeight: 700, padding: '4px 6px' },
  chatHeaderAvatar: {
    width: '36px', height: '36px', borderRadius: '50%',
    background: `linear-gradient(135deg, ${C.violet}, ${C.goldDark})`,
    color: C.champagne, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: '0.9rem', flexShrink: 0,
    border: `1px solid ${C.gold}`,
  },
  chatHeaderName: { fontWeight: 600, fontSize: '0.95rem', color: C.champagne },
  chatHeaderSub: { fontSize: '0.7rem', color: C.textSecondary },

  messageList: {
    flex: 1, minHeight: 0, overflowY: 'auto', padding: '0.5rem 0.75rem',
    display: 'flex', flexDirection: 'column', gap: '3px',
    background: `linear-gradient(180deg, ${C.obsidian} 0%, #0E0E12 100%)`,
  },
  msgRow: { display: 'flex', marginBottom: 2 },
  msgBubble: {
    maxWidth: '80%', padding: '0.55rem 0.75rem', borderRadius: '14px',
    fontSize: '0.9rem', lineHeight: 1.45, wordBreak: 'break-word',
  },

  /* Date separator */
  dateSep: { display: 'flex', justifyContent: 'center', padding: '0.5rem 0' },
  dateSepLabel: {
    background: C.cardBg, color: C.goldMuted, fontSize: '0.7rem',
    fontWeight: 600, padding: '4px 12px', borderRadius: '8px',
    border: `1px solid ${C.border}`,
  },

  /* Delete popup */
  deleteOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  deletePopup: {
    background: C.cardBg, borderRadius: '14px', padding: '1.25rem',
    maxWidth: '300px', width: '90%',
    border: `1px solid ${C.border}`,
  },
  deleteCancel: {
    background: 'none', border: `1px solid ${C.border}`, borderRadius: '8px',
    padding: '0.5rem 1rem', fontSize: '0.85rem', cursor: 'pointer', color: C.textSecondary,
  },
  deleteConfirm: {
    background: C.danger, color: '#fff', border: 'none', borderRadius: '8px',
    padding: '0.5rem 1rem', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600,
  },

  inputBar: {
    display: 'flex', alignItems: 'flex-end', gap: '0.4rem', padding: '0.5rem',
    background: C.darkSurface, borderTop: `1px solid ${C.border}`, flexShrink: 0,
  },
  inputField: {
    flex: 1, resize: 'none', border: `1px solid ${C.border}`, borderRadius: '20px',
    padding: '0.6rem 1rem', fontSize: '0.9rem', fontFamily: 'inherit',
    outline: 'none', maxHeight: '100px', lineHeight: 1.4,
    background: C.inputBg, color: C.textPrimary,
  },
  sendBtn: {
    width: '42px', height: '42px', borderRadius: '50%',
    background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
    color: C.obsidian, border: 'none', fontSize: '1.1rem', fontWeight: 700,
    cursor: 'pointer', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
};

export default MessagingPage;
