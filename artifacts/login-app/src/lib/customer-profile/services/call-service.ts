export type InitiateCallResult = {
  phone: string;
};

export class CallService {
  /**
   * Initiates an outbound call. Today this uses the device dialer (`tel:`).
   * Replace this implementation when the Call Center module is available.
   */
  static initiateCall(phone: string | null | undefined): InitiateCallResult {
    const normalized = phone?.trim();
    if (!normalized) {
      throw new Error("CUSTOMER_PHONE_MISSING");
    }

    window.location.href = `tel:${normalized}`;
    return { phone: normalized };
  }
}
