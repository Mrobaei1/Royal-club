import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'auth_service.dart';

class AdminService {
  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  static Future<Map<String, String>> _headers() async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) throw Exception('ابتدا وارد حساب شوید.');
    return {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'};
  }

  static Future<Map<String, dynamic>> _request(String method, String path, {Map<String, dynamic>? body}) async {
    final headers = await _headers();
    final uri = Uri.parse('${AuthService.baseUrl}$path');
    final response = switch (method) {
      'GET' => await http.get(uri, headers: headers),
      'POST' => await http.post(uri, headers: headers, body: jsonEncode(body ?? {})),
      'PATCH' => await http.patch(uri, headers: headers, body: jsonEncode(body ?? {})),
      'DELETE' => await http.delete(uri, headers: headers),
      _ => throw ArgumentError('Unsupported request method'),
    };
    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'درخواست ناموفق بود.');
    }
    return decoded;
  }

  static Future<Map<String, dynamic>> smsOtpSettings() async =>
      (await _request('GET', '/api/v1/admin/security/sms-otp'))['settings'] as Map<String, dynamic>;

  static Future<Map<String, dynamic>> saveSmsOtpSettings(Map<String, dynamic> settings) async =>
      (await _request('PATCH', '/api/v1/admin/security/sms-otp', body: settings))['settings'] as Map<String, dynamic>;

  static Future<Map<String, dynamic>> testSmsConnection() async =>
      await _request('POST', '/api/v1/admin/security/sms-otp/test-connection');

  static Future<Map<String, dynamic>> testSmsMessage({
    required String phone,
    required bool confirmCost,
  }) async => await _request('POST', '/api/v1/admin/security/sms-otp/test-message', body: {
        'phone': phone.trim(),
        'confirmCost': confirmCost,
      });


  static Future<List<dynamic>> agentTemplates({String? gameCode}) async {
    final query = gameCode == null || gameCode.trim().isEmpty
        ? ''
        : '?gameCode=${Uri.encodeQueryComponent(gameCode.trim())}';
    return (await _request('GET', '/api/v1/admin/agent-templates$query'))['templates'] as List<dynamic>? ?? [];
  }

  static Future<Map<String, dynamic>?> futureGameAgentTemplate(String gameCode) async {
    final response = await _request(
      'GET',
      '/api/v1/admin/agent-templates?gameCode=${Uri.encodeQueryComponent(gameCode.trim())}',
    );
    return response['gameSpecialist'] as Map<String, dynamic>?;
  }

  static Future<List<dynamic>> agentTasks() async =>
      (await _request('GET', '/api/v1/admin/agent-tasks'))['tasks'] as List<dynamic>? ?? [];

  static Future<Map<String, dynamic>> createAgentTask({
    required String code,
    required String title,
    required String domain,
    required String description,
    required List<String> requestedCapabilities,
    required bool requiresHumanApproval,
  }) async => (await _request('POST', '/api/v1/admin/agent-tasks', body: {
        'code': code.trim().toLowerCase(),
        'title': title.trim(),
        'domain': domain,
        'description': description.trim(),
        'requestedCapabilities': requestedCapabilities,
        'requiresHumanApproval': requiresHumanApproval,
      }))['task'] as Map<String, dynamic>;

  static Future<List<dynamic>> agentTaskProposals() async =>
      (await _request('GET', '/api/v1/admin/agent-task-proposals'))['proposals'] as List<dynamic>? ?? [];

  static Future<List<dynamic>> agentTaskAudit() async =>
      (await _request('GET', '/api/v1/admin/agent-task-audit'))['entries'] as List<dynamic>? ?? [];

  static Future<void> rejectAgentTaskProposal(String id, String reason) async {
    await _request('POST', '/api/v1/admin/agent-task-proposals/$id/reject', body: {'reason': reason});
  }

  static Future<Map<String, dynamic>> permissionSettings() async =>
      (await _request('GET', '/api/v1/admin/permissions/settings'))['settings'] as Map<String, dynamic>;

  static Future<Map<String, dynamic>> setDelegatedPermissionsEnabled(bool enabled) async =>
      (await _request('PATCH', '/api/v1/admin/permissions/settings', body: {'enabled': enabled}))['settings'] as Map<String, dynamic>;

  static Future<List<dynamic>> permissionGrants() async =>
      (await _request('GET', '/api/v1/admin/permissions/grants'))['grants'] as List<dynamic>? ?? [];

  static Future<List<dynamic>> permissionAudit() async =>
      (await _request('GET', '/api/v1/admin/permissions/audit'))['entries'] as List<dynamic>? ?? [];

  static Future<Map<String, dynamic>> createPermissionGrant({
    required String userId,
    required String permission,
    required String reason,
    String? approvalReference,
    List<String>? resourceIds,
  }) async => (await _request('POST', '/api/v1/admin/permissions/grants', body: {
        'userId': userId,
        'permission': permission,
        'reason': reason,
        if (approvalReference != null && approvalReference.trim().isNotEmpty)
          'approvalReference': approvalReference.trim(),
        if (resourceIds != null && resourceIds.isNotEmpty)
          'scope': {'resourceIds': resourceIds},
      }))['grant'] as Map<String, dynamic>;

  static Future<void> revokePermissionGrant(String grantId) async {
    await _request('DELETE', '/api/v1/admin/permissions/grants/$grantId');
  }

  static Future<Map<String, dynamic>> executiveAnalyticsOverview() async =>
      await _request('GET', '/api/v1/admin/analytics/overview');

  static Future<bool> isOwner() async => (await _request('GET', '/api/v1/admin/status'))['isOwner'] == true;
  static Future<Map<String, dynamic>> accountCustomizationPricing() async =>
      (await _request('GET', '/api/v1/admin/account-customization-pricing'))['settings'] as Map<String, dynamic>;

  static Future<Map<String, dynamic>> saveAccountCustomizationPricing({
    required int avatarChangePriceCredits,
    required int usernameChangePriceCredits,
  }) async => (await _request('PATCH', '/api/v1/admin/account-customization-pricing', body: {
        'avatarChangePriceCredits': avatarChangePriceCredits,
        'usernameChangePriceCredits': usernameChangePriceCredits,
      }))['settings'] as Map<String, dynamic>;

  static Future<List<dynamic>> plans() async => (await _request('GET', '/api/v1/admin/subscription-plans'))['plans'] as List<dynamic>? ?? [];

  static Future<List<dynamic>> leagues() async =>
      (await _request('GET', '/api/v1/admin/leagues'))['leagues'] as List<dynamic>? ?? [];

  static Future<Map<String, dynamic>> createLeague({
    required String code,
    required String name,
    required bool enabled,
    required String entryMode,
    required int subscriptionDaysCost,
    required String format,
    required int minimumParticipants,
  }) async => (await _request('POST', '/api/v1/admin/leagues', body: {
        'code': code.trim().toLowerCase(),
        'name': name.trim(),
        'enabled': enabled,
        'entryMode': entryMode,
        'subscriptionDaysCost': subscriptionDaysCost,
        'rules': {
          'format': format, 'minimumParticipants': minimumParticipants,
          'restPolicy': 'balanced_report_actual_games',
          'finalStagePolicy': 'manager_decides_by_format',
          'appealDeadlineHours': 24,
          'doubleAbsencePolicy': 'reschedule_if_possible',
          'technicalIssuePolicy': 'reschedule_if_possible',
        },
      }))['league'] as Map<String, dynamic>;

  static Future<Map<String, dynamic>> updateLeague(
    String id, {
    String? name,
    bool? enabled,
    String? entryMode,
    int? subscriptionDaysCost,
    Map<String, dynamic>? rules,
  }) async {
    final body = <String, dynamic>{};
    if (name != null) body['name'] = name.trim();
    if (enabled != null) body['enabled'] = enabled;
    if (entryMode != null) body['entryMode'] = entryMode;
    if (subscriptionDaysCost != null) body['subscriptionDaysCost'] = subscriptionDaysCost;
    if (rules != null) body['rules'] = rules;
    return (await _request('PATCH', '/api/v1/admin/leagues/$id', body: body))['league'] as Map<String, dynamic>;
  }
  static Future<Map<String, dynamic>> scheduleLeague(String id, {String? startsAt, int intervalDays = 7}) async =>
      await _request('POST', '/api/v1/admin/leagues/$id/schedule', body: {
        if (startsAt != null) 'startsAt': startsAt,
        'intervalDays': intervalDays,
      });

  static Future<Map<String, dynamic>> createLeagueRound(String id, Map<String, dynamic> body) async =>
      await _request('POST', '/api/v1/admin/leagues/$id/rounds', body: body);

  static Future<Map<String, dynamic>> leagueReport(String id) async =>
      await _request('GET', '/api/v1/admin/leagues/$id/report');

  static Future<Map<String, dynamic>> updateLeagueMatch(String id, {required String status, String? winnerId, Map<String, dynamic>? score, String? incidentNote, String? replacementAt}) async =>
      await _request('PATCH', '/api/v1/admin/league-matches/$id', body: {
        'status': status,
        if (winnerId != null) 'winnerId': winnerId,
        if (score != null) 'score': score,
        if (incidentNote != null) 'incidentNote': incidentNote,
        if (replacementAt != null) 'replacementAt': replacementAt,
      });

  static Future<Map<String, dynamic>> resolveLeagueAppeal(String id, {required String status, String? managerNote}) async =>
      await _request('PATCH', '/api/v1/admin/league-appeals/$id', body: {
        'status': status,
        if (managerNote != null) 'managerNote': managerNote,
      });

  static Future<List<dynamic>> findUser(String email) async =>
      (await _request('GET', '/api/v1/users/search?email=${Uri.encodeQueryComponent(email.trim())}'))['users'] as List<dynamic>? ?? [];
  static Future<Map<String, dynamic>> exportUserProfile(String userId) async =>
      (await _request('GET', '/api/v1/admin/users/$userId/profile'))['user'] as Map<String, dynamic>;

  static Future<void> credit(String userId, int amount, String description) async {
    await _request('POST', '/api/v1/admin/wallet/credit', body: {'userId': userId, 'amount': amount, 'description': description});
  }
  static Future<int> sendNotification({String? userId, required String title, required String body}) async {
    final result = await _request('POST', '/api/v1/admin/notifications', body: {
      if (userId != null) 'userId': userId,
      'title': title,
      'body': body,
    });
    return (result['sent'] as num?)?.toInt() ?? 0;
  }

  static Future<List<dynamic>> reports() async =>
      (await _request('GET', '/api/v1/admin/reports'))['reports'] as List<dynamic>? ?? [];

  static Future<void> updateReport(String id, String status) async {
    await _request('PATCH', '/api/v1/admin/reports/$id', body: {'status': status});
  }

  static Future<void> updatePlan(String code, {String? name, int? durationDays, int? priceCredits, bool? active}) async {
    final body = <String, dynamic>{};
    if (name != null) body['name'] = name;
    if (durationDays != null) body['durationDays'] = durationDays;
    if (priceCredits != null) body['priceCredits'] = priceCredits;
    if (active != null) body['active'] = active;
    await _request('PATCH', '/api/v1/admin/subscription-plans/$code', body: body);
  }
}
