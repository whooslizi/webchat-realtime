import { RoomRole } from './enums.js';
import { AttachmentDto, DirectReceiveMessagePayload, RoomReceiveMessagePayload } from './events.js';

// ==========================================
// AUTH DTOs
// ==========================================

/**
 * Another User as anyone may see them: user search, Room Members, Direct Chat partners and
 * message senders, over REST and socket alike. Never carries the email (SEC-13).
 */
export interface PublicUserDto {
  id: string;
  username: string;
  isOnline: boolean;
  lastSeenAt: string;
}

/** The signed-in User's own account, with email. Only `/api/auth/me`, register and login return it. */
export interface SelfUserDto extends PublicUserDto {
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterRequestDto {
  username: string;
  email: string;
  password: string;
  /** Required while Turnstile is on (see `TurnstileConfigDto`). */
  turnstileToken?: string;
}

export interface LoginRequestDto {
  emailOrUsername: string;
  password: string;
  /** Required while Turnstile is on (see `TurnstileConfigDto`). */
  turnstileToken?: string;
}

/** `GET /api/auth/turnstile`: the public site key, or null when the bot check is off. */
export interface TurnstileConfigDto {
  siteKey: string | null;
}

/**
 * Body of register, login and `GET /api/auth/me`. The Session itself travels only in the
 * HttpOnly `__Host-session` cookie, never in a body (ADR 0010).
 */
export interface AuthResponseDto {
  user: SelfUserDto;
}

// ==========================================
// DIRECT CHAT DTOs
// ==========================================

export interface DirectChatDto {
  id: string;
  user1Id: string;
  user2Id: string;
  createdAt: string;
  updatedAt: string;
  partner?: PublicUserDto;
}

export interface DirectChatListItemDto {
  id: string;
  partner: PublicUserDto;
  lastMessage?: DirectReceiveMessagePayload | null;
  unreadCount: number;
  lastReadMessageId?: string | null;
  partnerLastReadMessageId?: string | null;
  updatedAt: string;
}

export interface CreateDirectChatRequestDto {
  targetUserId: string;
}

// ==========================================
// ROOM CHAT DTOs
// ==========================================

export interface RoomDto {
  id: string;
  name: string;
  description?: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoomListItemDto {
  id: string;
  name: string;
  description?: string | null;
  ownerId: string;
  role: RoomRole;
  lastMessage?: RoomReceiveMessagePayload | null;
  unreadCount: number;
  memberCount: number;
  updatedAt: string;
}

export interface CreateRoomRequestDto {
  name: string;
  description?: string;
}

export interface RoomMemberDto {
  id: string;
  roomId: string;
  userId: string;
  role: RoomRole;
  lastReadMessageId?: string | null;
  joinedAt: string;
  user: PublicUserDto;
}

export interface RoomDetailDto extends RoomDto {
  members: RoomMemberDto[];
  role?: RoomRole;
  memberCount: number;
}

export interface AddRoomMemberRequestDto {
  userId: string;
}

export interface ChangeRoomMemberRoleRequestDto {
  role: RoomRole.ADMIN | RoomRole.MEMBER;
}

// ==========================================
// PAGINATION & MEDIA DTOs
// ==========================================

export interface PaginatedMessagesDto<T> {
  messages: T[];
  nextCursor?: string | null;
  hasMore: boolean;
}

/** `201` answer of `POST /api/upload`: the new, not yet sent Attachment. */
export interface UploadResponseDto {
  attachment: AttachmentDto;
}

/** Answer of `GET /api/attachments/:id/url`. */
export interface AttachmentUrlDto {
  url: string;
  expiresAt: string; // ISO String
}

export interface GifItemDto {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
}

// ==========================================
// INVARIANT HELPERS
// ==========================================

/**
 * Normalizes two user IDs so user1Id < user2Id lexicographically.
 * Guarantees direct chat pair uniqueness in DB (ADR 0001).
 */
export function normalizeDirectChatPair(userIdA: string, userIdB: string): [string, string] {
  return userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];
}
