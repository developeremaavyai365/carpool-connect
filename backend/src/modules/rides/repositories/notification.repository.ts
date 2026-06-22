import { queryOne, query } from './pg.client';

export class NotificationRepository {
  async create(
    employeeId: number,
    type: string,
    title: string,
    message: string,
  ): Promise<void> {
    await query(
      `INSERT INTO notifications (employee_id, type, title, message)
       VALUES ($1, $2, $3, $4)`,
      [employeeId, type, title, message],
    );
  }
}

export const notificationRepository = new NotificationRepository();
