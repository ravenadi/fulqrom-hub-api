# Known Issues & Future Enhancements

## Current Known Issues

### 1. Email Service Limitations

**Issue:** Email delivery depends on SMTP provider configuration
- Development mode uses local SMTP (mailhog on port 1025)
- Production requires proper SMTP/SendGrid/AWS SES setup
- No email queue system for retry on failure

**Workaround:** Use `MAIL_PROVIDER=console` for testing (emails logged to console)

**Priority:** Medium

---

### 2. File Upload Size Limits

**Issue:** Current limit is 10MB for JSON payload and file uploads
- Configured in `server.js:46-47`
- Large building plans or asset documents may exceed limit

**Workaround:** Split large files or increase limit in production

**Priority:** Low

---

### 3. No Pagination on All Endpoints

**Issue:** Some endpoints return all records without pagination
- Customers, Vendors, Roles endpoints have no pagination
- Could cause performance issues with large datasets (1000+ records)

**Current State:**
- Documents, Assets, Sites have pagination implemented
- Customers, Vendors, Roles return all records

**Priority:** Medium

---

### 4. Document Versioning Storage

**Issue:** Previous document versions stored in S3 without cleanup mechanism
- Each version creates new S3 object
- No automatic deletion of old versions
- Could accumulate storage costs over time

**Workaround:** Manual S3 lifecycle policies or periodic cleanup

**Priority:** Low

---

### 5. Asset Import Limitations

**Issue:** Bulk asset import removed (was in scripts/comprehensive-fill-assets.js)
- No UI for bulk CSV import
- Manual entry required for large asset datasets

**Workaround:** Use MongoDB direct import or restore import scripts from code-clean

**Priority:** Medium

---

## Future Enhancements

### High Priority

1. **Authentication & Authorization**
   - Currently no JWT/session authentication implemented
   - User/Role models exist but no auth middleware
   - Recommended: JWT with refresh tokens

2. **API Rate Limiting**
   - No rate limiting implemented
   - Vulnerable to abuse/DDoS
   - Recommended: express-rate-limit middleware

3. **Audit Logging**
   - No tracking of who created/modified records
   - Add `created_by`, `updated_by` fields to all models
   - Implement audit trail for compliance

4. **Search & Advanced Filtering**
   - Basic filtering exists but no full-text search
   - Recommended: MongoDB text indexes or Elasticsearch integration

### Medium Priority

5. **Webhook Support**
   - Allow external systems to receive notifications
   - Document approval notifications
   - Asset status changes

6. **Batch Operations**
   - Bulk update/delete for assets
   - Bulk document upload
   - CSV import/export for all entities

7. **Background Jobs**
   - Email sending queue (Bull/BullMQ)
   - Document processing queue
   - Scheduled maintenance reminders

8. **Analytics & Reporting**
   - Asset lifecycle reports
   - Maintenance cost analysis
   - Building energy efficiency metrics (NABERS)

9. **API Versioning**
   - Current API has no version prefix
   - Recommended: `/api/v1/` structure for future compatibility

10. **Geolocation Services**
    - Australian address validation via Australia Post API
    - Geocoding for site locations
    - Distance calculations for service coverage

### Low Priority

11. **Multi-tenancy**
    - Current design supports single deployment
    - Add tenant isolation for SaaS model

12. **Advanced Document Management**
    - OCR for scanned documents
    - AI-powered document classification
    - Automatic compliance checking

13. **IoT Integration**
    - Real-time sensor data from HVAC systems
    - Predictive maintenance alerts
    - Energy consumption monitoring

14. **Mobile Push Notifications**
    - Maintenance alerts for technicians
    - Approval requests for managers

15. **GraphQL API**
    - Alternative to REST for complex queries
    - Reduce over-fetching on mobile clients

---

## Performance Considerations

### Database Indexes

Current indexes are basic. Consider adding:
```javascript
// Customers
{ abn: 1, is_active: 1 }
{ name: 'text' }

// Assets
{ site_id: 1, building_id: 1, status: 1 }
{ asset_type: 1, is_critical: 1 }

// Documents
{ entity_type: 1, entity_id: 1, status: 1 }
{ tags: 1 }
```

### Caching Strategy

No caching implemented. Consider:
- Redis for session storage (when auth is added)
- In-memory cache for dropdowns/static data
- CDN for S3 document URLs

### Query Optimization

Some routes perform multiple database queries:
- `routes/hierarchy.js` - Multiple nested queries
- `routes/documents.js` - Could use aggregation pipeline

---

## Security Recommendations

1. **Environment Variables**
   - Current `.env` has actual credentials (MongoDB, AWS)
   - Rotate all production keys before deployment
   - Use AWS Secrets Manager or similar

2. **Input Validation**
   - Joi validation implemented but could be stricter
   - Add SQL injection prevention (currently MongoDB-safe)
   - Implement CSRF protection when auth is added

3. **CORS Configuration**
   - Currently allows multiple origins for development
   - Restrict to production domain only: `server.js:32-43`

4. **File Upload Security**
   - Validate file types beyond extension checking
   - Scan uploads for malware (ClamAV integration)
   - Implement virus scanning before S3 upload

5. **API Security Headers**
   - Helmet.js configured but consider additional CSP rules
   - Add API key authentication for public endpoints

---

## Testing Requirements

Currently no tests implemented. Recommended:

1. **Unit Tests**
   - Model validation tests
   - Utility function tests (emailService, s3Service)
   - Middleware tests

2. **Integration Tests**
   - API endpoint tests for all routes
   - Database operation tests
   - S3 upload/download tests

3. **End-to-End Tests**
   - Complete workflows (create customer → site → building → asset)
   - Document approval workflow
   - User role permissions

**Test Framework Suggestions:**
- Jest for unit tests
- Supertest for API integration tests
- MongoDB Memory Server for test database

---

## Deployment Considerations

### Staging Environment

Currently only production and development modes:
- Add staging environment configuration
- Separate S3 bucket for staging
- Staging MongoDB database

### CI/CD Pipeline

No automated deployment configured:
- GitHub Actions for automated tests
- Docker containerization for consistent deployment
- Automated database migrations

### Monitoring & Alerting

Basic health check exists (`/health`) but no monitoring:
- Application Performance Monitoring (APM): New Relic, Datadog
- Error tracking: Sentry
- Uptime monitoring: Pingdom, UptimeRobot
- Log aggregation: CloudWatch, Papertrail

---

## Documentation Gaps

1. **API Authentication Flow** - To be implemented
2. **Error Code Reference** - Comprehensive list of all error codes
3. **Webhook Documentation** - When webhooks are added
4. **SDK/Client Libraries** - JavaScript, Python clients for API consumption
5. **Postman Collection** - Import-ready API collection

---

## Breaking Changes to Avoid

When implementing future features, maintain backward compatibility:

1. Don't change existing field names in responses
2. Don't remove endpoints without deprecation notice
3. Add new fields as optional, not required
4. Version API when making breaking changes (`/api/v2/`)

---

## Migration Notes

If migrating from legacy system:

1. **Data Import Scripts** - Available in `code-clean/` folder
2. **Customer Migration** - ABN/ACN validation may require data cleanup
3. **Asset Hierarchy** - Ensure customer → site → building → floor → asset relationships
4. **Document Upload** - Batch upload may require custom script

---

## Contribution Guidelines

For future development:

1. Follow existing code structure and naming conventions
2. Add Joi validation for all new endpoints
3. Use Australian English spelling (colour, centre, realise)
4. Update this document when adding new features
5. Test with Australian data formats (DD/MM/YYYY, 4-digit postcodes)
6. Include error handling with meaningful messages

---

## Support & Maintenance

**Immediate Post-Deployment:**
- Monitor error logs for first 48 hours
- Verify email delivery in production
- Test S3 upload/download with production credentials
- Validate MongoDB connection stability

**Regular Maintenance:**
- Weekly database backups (see DEPLOYMENT.md)
- Monthly npm audit and security updates
- Quarterly dependency updates
- Annual security review

---

**Version:** 1.0.0
**Last Updated:** October 2025
**Developed by Ravenlabs Team**
