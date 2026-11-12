import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/services/admin_service.dart';

void main() {
  group('AdminService.leagueAuditPath', () {
    test('builds the first page request with a bounded default limit', () {
      expect(
        AdminService.leagueAuditPath('42'),
        '/api/v1/admin/leagues/42/audit?limit=50',
      );
    });

    test('encodes the cursor and preserves the requested page size', () {
      expect(
        AdminService.leagueAuditPath('42', limit: 25, beforeId: '1200'),
        '/api/v1/admin/leagues/42/audit?limit=25&beforeId=1200',
      );
    });

    test('omits an empty cursor instead of sending an empty pagination value', () {
      expect(
        AdminService.leagueAuditPath('42', limit: 10, beforeId: ''),
        '/api/v1/admin/leagues/42/audit?limit=10',
      );
    });
  });
}
