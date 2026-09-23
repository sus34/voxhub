/** identity is the user id (stable, used as a key); what people see is the name. */
export const nameOf = (p) => p.name || p.identity;
