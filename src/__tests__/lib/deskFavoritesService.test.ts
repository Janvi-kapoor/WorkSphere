import { deskFavoritesService } from "@/lib/venues/deskFavoritesService";

describe("deskFavoritesService", () => {
  it("clears currentReservationEndsAt when vacancy notification is triggered", () => {
    const venueId = "venue-123";
    const deskId = "desk-7"; // default reserved desk
    const initialStatus = deskFavoritesService.getDeskAvailability(venueId, deskId);
    expect(initialStatus.isFree).toBe(false);
    expect(initialStatus.status).toBe("reserved");
    expect(initialStatus.currentReservationEndsAt).toBeDefined();

    deskFavoritesService.triggerVacancyNotification(
      venueId,
      deskId,
      "Desk 7",
      "Downtown Hub",
    );

    const updatedStatus = deskFavoritesService.getDeskAvailability(venueId, deskId);
    expect(updatedStatus.isFree).toBe(true);
    expect(updatedStatus.status).toBe("available");
    expect(updatedStatus.currentReservationEndsAt).toBeUndefined();
    expect(updatedStatus.nextAvailableTime).toBe("Now");
  });
});
