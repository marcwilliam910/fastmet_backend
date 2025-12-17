export const createConversationId = (clientId: string, driverId: string) => {
  return [clientId, driverId].sort().join("_");
};

// export async function getUnreadCount(
//   conversationId: string,
//   userType: "client" | "driver"
// ) {
//   const conversation = await ConversationModel.findById(conversationId);
//   return conversation?.unreadCount?.[userType] || 0;
// }
