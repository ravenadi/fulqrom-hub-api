# Frontend Update Prompt: Document Version Management

## Overview
The document versioning system has been refactored. When uploading a new file version, the system now **updates the same document record** instead of creating duplicate records. Historical file versions are stored in a separate `DocumentVersion` collection.

## What Changed in Backend

### Key Changes
1. **Upload New Version**: Now updates the same document (no duplicate records)
2. **Version History API**: Changed from `/api/documents/versions/:documentGroupId` to `/api/documents/:id/versions`
3. **Download Version API**: Changed from `/api/documents/versions/:versionId/download` to `/api/documents/:id/versions/:versionId/download`
4. **Table View**: Automatically shows only one row per document (no filtering needed)

## Frontend Updates Required

### 1. Document Table/List View
**No changes needed** - Table view will automatically show one row per document since backend no longer creates duplicates.

**Expected Behavior:**
- Each document appears once in the table
- All header data (location, customer, category, etc.) shows correctly
- Latest file version is displayed

### 2. Document Detail/Edit View
**Required Changes:**

#### 2.1 Display Current File
- Show the current file from the document record
- Display current version number from `document.version_number` or `document.version`

#### 2.2 Add Version History Section
- Create a new "Version History" section/tab in the document detail/edit view
- Call the new API endpoint to fetch version history
- Display all versions (current + historical) in a list

### 3. API Integration Updates

#### 3.1 Fetch Version History
**New Endpoint:**
```
GET /api/documents/:id/versions
```

**Request:**
```javascript
// Replace documentId with actual document ID
const response = await fetch(`/api/documents/${documentId}/versions`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "current_doc_id",
      "document_id": "current_doc_id",
      "version_number": "2.0",
      "version_sequence": 3,
      "is_current_version": true,
      "is_historical": false,
      "created_at": "2024-01-15T10:30:00Z",
      "created_by": "John Doe",
      "file_name": "document_v2.0.pdf",
      "file_size": 1024000,
      "file_url": "https://...",
      "file_key": "documents/...",
      "change_notes": "Updated with latest revisions"
    },
    {
      "_id": "version_id_1",
      "document_id": "current_doc_id",
      "version_number": "1.0",
      "version_sequence": 1,
      "is_current_version": false,
      "is_historical": true,
      "created_at": "2024-01-15T09:00:00Z",
      "created_by": "Jane Smith",
      "file_name": "document_v1.0.pdf",
      "file_size": 987000,
      "file_url": "https://...",
      "file_key": "documents/...",
      "change_notes": "Initial version"
    }
  ],
  "total": 2,
  "current_version": "2.0"
}
```

#### 3.2 Upload New Version
**Endpoint (unchanged, but behavior changed):**
```
POST /api/documents/:id/versions
Content-Type: multipart/form-data
```

**Request:**
```javascript
const formData = new FormData();
formData.append('file', fileBlob);
formData.append('uploaded_by', JSON.stringify({
  user_id: currentUser.id,
  user_name: currentUser.name,
  email: currentUser.email
}));
formData.append('change_notes', 'Optional change notes');

const response = await fetch(`/api/documents/${documentId}/versions`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
```

**Response (updated):**
```json
{
  "success": true,
  "message": "New version uploaded successfully",
  "data": {
    "document": {
      "_id": "document_id",
      "version_number": "3.0",
      // ... full document object with updated file
    },
    "version_number": "3.0",
    "uploaded_by": "John Doe",
    "uploaded_at": "2024-01-15T11:00:00Z"
  }
}
```

**Important:** After uploading new version:
- **Refresh the document detail view** to show updated file
- **Refresh version history** to show new version in list
- The document record in the table will automatically show new version (no action needed)

#### 3.3 Download Historical Version
**New Endpoint:**
```
GET /api/documents/:id/versions/:versionId/download
```

**Request:**
```javascript
// versionId can be either:
// - Document._id (for current version)
// - DocumentVersion._id (for historical version)
const response = await fetch(`/api/documents/${documentId}/versions/${versionId}/download`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

**Response:**
```json
{
  "success": true,
  "download_url": "https://s3.amazonaws.com/...presigned-url...",
  "expires_in": 3600,
  "file_name": "document_v1.0.pdf",
  "version_number": "1.0"
}
```

**Usage:**
```javascript
// Open download URL in new tab or trigger download
window.open(data.download_url, '_blank');
// OR
const link = document.createElement('a');
link.href = data.download_url;
link.download = data.file_name;
link.click();
```

### 4. UI/UX Components to Create/Update

#### 4.1 Version History Component (New)
Create a component to display version history in document detail/edit view:

**Suggested Structure:**
```vue
<!-- DocumentVersionHistory.vue or similar -->
<template>
  <div class="version-history">
    <h3>Version History</h3>
    <div class="version-list">
      <div 
        v-for="version in versions" 
        :key="version._id"
        :class="['version-item', { 'current': version.is_current_version }]"
      >
        <div class="version-header">
          <span class="version-number">v{{ version.version_number }}</span>
          <span v-if="version.is_current_version" class="badge current-badge">Current</span>
          <span class="uploaded-by">{{ version.created_by }}</span>
          <span class="uploaded-date">{{ formatDate(version.created_at) }}</span>
        </div>
        <div class="version-details">
          <span class="file-name">{{ version.file_name }}</span>
          <span class="file-size">{{ formatFileSize(version.file_size) }}</span>
        </div>
        <div v-if="version.change_notes" class="change-notes">
          {{ version.change_notes }}
        </div>
        <button 
          @click="downloadVersion(version._id)"
          class="download-btn"
        >
          Download
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    documentId: String
  },
  data() {
    return {
      versions: [],
      loading: false
    }
  },
  mounted() {
    this.fetchVersions();
  },
  methods: {
    async fetchVersions() {
      this.loading = true;
      try {
        const response = await this.$api.get(`/documents/${this.documentId}/versions`);
        this.versions = response.data.data;
      } catch (error) {
        console.error('Error fetching versions:', error);
        this.$toast.error('Failed to load version history');
      } finally {
        this.loading = false;
      }
    },
    async downloadVersion(versionId) {
      try {
        const response = await this.$api.get(
          `/documents/${this.documentId}/versions/${versionId}/download`
        );
        window.open(response.data.download_url, '_blank');
      } catch (error) {
        console.error('Error downloading version:', error);
        this.$toast.error('Failed to download version');
      }
    },
    formatDate(dateString) {
      // Format date as needed
      return new Date(dateString).toLocaleDateString();
    },
    formatFileSize(bytes) {
      // Format file size (KB, MB, GB)
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
      if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
      return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }
  }
}
</script>
```

#### 4.2 Upload New Version Component (Update)
Update existing file upload component to handle new version upload:

**Update Points:**
1. After successful upload, refresh document detail view
2. Refresh version history list
3. Show success message with new version number
4. Optionally allow user to enter "change notes" before upload

**Example Integration:**
```vue
<template>
  <div class="upload-version">
    <input 
      type="file" 
      @change="handleFileSelect"
      ref="fileInput"
    />
    <textarea
      v-model="changeNotes"
      placeholder="Optional: Add change notes for this version"
      rows="3"
    ></textarea>
    <button @click="uploadVersion" :disabled="!selectedFile || uploading">
      {{ uploading ? 'Uploading...' : 'Upload New Version' }}
    </button>
  </div>
</template>

<script>
export default {
  props: {
    documentId: String
  },
  data() {
    return {
      selectedFile: null,
      changeNotes: '',
      uploading: false
    }
  },
  methods: {
    handleFileSelect(event) {
      this.selectedFile = event.target.files[0];
    },
    async uploadVersion() {
      if (!this.selectedFile) return;
      
      this.uploading = true;
      try {
        const formData = new FormData();
        formData.append('file', this.selectedFile);
        formData.append('uploaded_by', JSON.stringify({
          user_id: this.$store.state.user.id,
          user_name: this.$store.state.user.name,
          email: this.$store.state.user.email
        }));
        if (this.changeNotes) {
          formData.append('change_notes', this.changeNotes);
        }

        const response = await this.$api.post(
          `/documents/${this.documentId}/versions`,
          formData,
          {
            headers: { 'Content-Type': 'multipart/form-data' }
          }
        );

        this.$toast.success(
          `Version ${response.data.data.version_number} uploaded successfully`
        );
        
        // Refresh document detail and version history
        this.$emit('version-uploaded');
        
        // Reset form
        this.selectedFile = null;
        this.changeNotes = '';
        this.$refs.fileInput.value = '';
      } catch (error) {
        console.error('Error uploading version:', error);
        this.$toast.error('Failed to upload new version');
      } finally {
        this.uploading = false;
      }
    }
  }
}
</script>
```

#### 4.3 Document Detail View Integration
Update document detail/edit view to include version history:

```vue
<template>
  <div class="document-detail">
    <!-- Current Document Info -->
    <div class="document-info">
      <h2>{{ document.name }}</h2>
      <p>Version: {{ document.version_number || '1.0' }}</p>
      <!-- Other document fields -->
    </div>

    <!-- Current File -->
    <div class="current-file">
      <h3>Current File</h3>
      <a :href="currentFileUrl" target="_blank">
        {{ document.file?.file_meta?.file_name }}
      </a>
    </div>

    <!-- Upload New Version Button/Component -->
    <UploadNewVersion 
      :document-id="document._id"
      @version-uploaded="handleVersionUploaded"
    />

    <!-- Version History -->
    <DocumentVersionHistory 
      :document-id="document._id"
      :key="historyKey"
    />
  </div>
</template>

<script>
import UploadNewVersion from '@/components/UploadNewVersion.vue';
import DocumentVersionHistory from '@/components/DocumentVersionHistory.vue';

export default {
  components: {
    UploadNewVersion,
    DocumentVersionHistory
  },
  data() {
    return {
      document: {},
      historyKey: 0 // Force re-render on version upload
    }
  },
  methods: {
    handleVersionUploaded() {
      // Refresh document data
      this.fetchDocument();
      // Force version history to refresh
      this.historyKey += 1;
    },
    async fetchDocument() {
      const response = await this.$api.get(`/documents/${this.documentId}`);
      this.document = response.data.data;
    }
  }
}
</script>
```

### 5. Migration Notes for Existing Code

#### 5.1 Remove Old API Calls
If code uses old endpoints, update them:
- ❌ Old: `/api/documents/versions/:documentGroupId`
- ✅ New: `/api/documents/:id/versions`

- ❌ Old: `/api/documents/versions/:versionId/download`
- ✅ New: `/api/documents/:id/versions/:versionId/download`

#### 5.2 Remove is_current_version Filtering
If any code filters documents by `is_current_version`, **remove it**. The table will naturally show one row per document now.

#### 5.3 Update Version Display
- Current version is the one in the document record itself
- Historical versions come from the version history API
- Use `is_current_version` flag from API response to distinguish

### 6. Testing Checklist

- [ ] Document table shows one row per document (no duplicates)
- [ ] Document detail view displays current file correctly
- [ ] Version history section loads and displays all versions
- [ ] Current version is clearly marked in version history
- [ ] Upload new version works and updates document
- [ ] After upload, detail view shows new file
- [ ] After upload, version history shows new version
- [ ] Download works for current version
- [ ] Download works for historical versions
- [ ] Change notes are saved and displayed
- [ ] Uploaded by/user info is displayed correctly
- [ ] Date/time stamps are formatted and displayed

### 7. API Endpoint Summary

| Action | Method | Endpoint | Notes |
|--------|--------|----------|-------|
| Get version history | GET | `/api/documents/:id/versions` | Returns current + historical |
| Upload new version | POST | `/api/documents/:id/versions` | Updates same document record |
| Download version | GET | `/api/documents/:id/versions/:versionId/download` | Supports current & historical |
| Get document (detail) | GET | `/api/documents/:id` | Unchanged - shows latest version |
| List documents | GET | `/api/documents` | Unchanged - naturally shows one per doc |

## Key Points to Remember

1. **No duplicate records**: Each document appears once in table
2. **Same document, new file**: Uploading version updates the same document record
3. **History separate**: Historical files stored in DocumentVersion collection
4. **API changed**: Version history endpoint changed from `documentGroupId` to `documentId` (document._id)
5. **Download changed**: Download endpoint now requires both `documentId` and `versionId`

## Example Complete Flow

1. User views document list → sees one row per document ✅
2. User clicks document → detail view opens ✅
3. Detail view shows:
   - Current file (from document.file) ✅
   - Current version number ✅
   - Upload new version button ✅
   - Version history list (from API) ✅
4. User uploads new version → document.file updates ✅
5. Version history refreshes → shows new version as current ✅
6. Old version moves to history (via DocumentVersion collection) ✅
7. User can download any historical version ✅

---

**Questions or Issues?**
- Review API response format carefully
- Ensure documentId is the document's `_id` (not documentGroupId)
- Check that versionId in download is either Document._id or DocumentVersion._id
- Verify tenant context is properly passed in API calls

