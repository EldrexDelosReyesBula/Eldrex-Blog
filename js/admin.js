// js/admin.js
import { 
    auth, db, storage,
    signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile,
    collection, query, where, orderBy, limit, getDocs, getDoc,
    doc, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp, increment,
    writeBatch, ref, uploadBytes, getDownloadURL, deleteObject
} from './firebase-config.js';

// Global variables
let currentAdmin = null;
let currentTab = 'posts';
let postEditor = null;
let editingPostId = null;

// Initialize admin dashboard
document.addEventListener('DOMContentLoaded', async () => {
    await initAdmin();
    setupAdminEventListeners();
});

// Initialize admin
async function initAdmin() {
    // Check if admin is already logged in
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Check if user is admin
            const token = await user.getIdTokenResult();
            if (token.claims.admin) {
                currentAdmin = user;
                showAdminDashboard();
                await loadStats();
                await loadPosts();
                loadAdminSettings();
            } else {
                // Not an admin, show login
                showNotification('Admin access required', 'error');
                signOut(auth);
            }
        } else {
            // Not logged in, show login form
            showLoginForm();
        }
    });
    
    // Login form submission
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await adminLogin();
    });
}

// Set up admin event listeners
function setupAdminEventListeners() {
    // Comment filter
    document.getElementById('comment-filter').addEventListener('change', (e) => {
        loadComments(e.target.value);
    });
    
    // Image upload
    document.getElementById('image-upload').addEventListener('change', handleImageUpload);
    
    // Initialize Quill editor when modal opens
    const modal = document.getElementById('new-post-modal');
    modal.addEventListener('shown', initPostEditor);
}

// Admin login
async function adminLogin() {
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const loginBtn = document.getElementById('login-btn');
    
    if (!email || !password) {
        showNotification('Please enter email and password', 'warning');
        return;
    }
    
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing In...';
    loginBtn.disabled = true;
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
        
        // Check admin status
        const user = auth.currentUser;
        const token = await user.getIdTokenResult();
        
        if (!token.claims.admin) {
            throw new Error('Admin access required');
        }
        
        showNotification('Admin login successful', 'success');
        
    } catch (error) {
        console.error('Admin login error:', error);
        showNotification('Invalid credentials or admin access required', 'error');
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
        loginBtn.disabled = false;
    }
}

// Admin logout
async function adminLogout() {
    try {
        await signOut(auth);
        showNotification('Logged out successfully', 'success');
    } catch (error) {
        console.error('Logout error:', error);
        showNotification('Failed to log out', 'error');
    }
}

// Show/hide admin dashboard
function showAdminDashboard() {
    document.getElementById('admin-login').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    
    // Set admin name
    const adminName = document.getElementById('admin-name');
    adminName.textContent = currentAdmin.displayName || 'Admin';
}

function showLoginForm() {
    document.getElementById('admin-login').classList.remove('hidden');
    document.getElementById('admin-dashboard').classList.add('hidden');
}

// Load admin stats
async function loadStats() {
    try {
        // Total posts
        const postsQuery = query(collection(db, 'posts'));
        const postsSnapshot = await getDocs(postsQuery);
        
        const totalPosts = postsSnapshot.size;
        const publishedPosts = postsSnapshot.docs.filter(doc => doc.data().published).length;
        const draftPosts = totalPosts - publishedPosts;
        
        // Total comments (approximate - we'll count from posts)
        let totalComments = 0;
        for (const postDoc of postsSnapshot.docs) {
            const post = postDoc.data();
            totalComments += post.commentCount || 0;
        }
        
        // Update UI
        document.getElementById('total-posts').textContent = totalPosts;
        document.getElementById('published-posts').textContent = publishedPosts;
        document.getElementById('draft-posts').textContent = draftPosts;
        document.getElementById('total-comments').textContent = totalComments;
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load posts for admin
async function loadPosts() {
    try {
        const postsQuery = query(
            collection(db, 'posts'),
            orderBy('createdAt', 'desc')
        );
        
        const snapshot = await getDocs(postsQuery);
        const postsList = document.getElementById('posts-list');
        
        if (snapshot.empty) {
            postsList.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-newspaper text-4xl text-gray-300 mb-4"></i>
                    <p class="text-gray-500">No posts yet</p>
                    <button onclick="createNewPost()" 
                            class="mt-4 text-emberflare-600 hover:text-emberflare-800">
                        Create your first post
                    </button>
                </div>
            `;
            return;
        }
        
        postsList.innerHTML = snapshot.docs.map(docSnap => {
            const post = docSnap.data();
            const postId = docSnap.id;
            const date = post.createdAt?.toDate() || new Date();
            
            return `
                <div class="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
                    <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div class="flex-1">
                            <div class="flex items-center gap-3 mb-2">
                                <h3 class="text-lg font-semibold text-gray-900">${post.title}</h3>
                                <span class="px-2 py-1 text-xs rounded-full ${post.published ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}">
                                    ${post.published ? 'Published' : 'Draft'}
                                </span>
                            </div>
                            
                            <div class="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-3">
                                <span>${date.toLocaleDateString()}</span>
                                ${post.category ? `
                                    <span class="flex items-center gap-1">
                                        <i class="fas fa-tag"></i>
                                        ${post.category.split(',').slice(0, 2).join(', ')}
                                    </span>
                                ` : ''}
                                <span class="flex items-center gap-1">
                                    <i class="far fa-eye"></i>
                                    ${post.views || 0} views
                                </span>
                                <span class="flex items-center gap-1">
                                    <i class="far fa-heart"></i>
                                    ${post.likes || 0} likes
                                </span>
                                <span class="flex items-center gap-1">
                                    <i class="far fa-comment"></i>
                                    ${post.commentCount || 0} comments
                                </span>
                            </div>
                            
                            <p class="text-gray-600 line-clamp-2">${post.excerpt || post.content?.substring(0, 200) + '...' || ''}</p>
                        </div>
                        
                        <div class="flex gap-2">
                            <button onclick="editPost('${postId}')" 
                                    class="p-2 hover:bg-emberflare-50 text-emberflare-600 rounded-lg transition-colors"
                                    title="Edit post">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="deletePost('${postId}')" 
                                    class="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                                    title="Delete post">
                                <i class="fas fa-trash"></i>
                            </button>
                            <button onclick="togglePostPublish('${postId}', ${!post.published})"
                                    class="p-2 ${post.published ? 'hover:bg-gray-100 text-gray-600' : 'hover:bg-green-50 text-green-600'} rounded-lg transition-colors"
                                    title="${post.published ? 'Unpublish' : 'Publish'}">
                                <i class="fas ${post.published ? 'fa-eye-slash' : 'fa-eye'}"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading posts:', error);
        showNotification('Failed to load posts', 'error');
    }
}

// Load comments for admin
async function loadComments(filter = 'all') {
    try {
        const commentsList = document.getElementById('comments-list');
        commentsList.innerHTML = `
            <div class="flex justify-center py-12">
                <div class="loading-spinner"></div>
            </div>
        `;
        
        const postsSnapshot = await getDocs(collection(db, 'posts'));
        let allComments = [];
        
        for (const postDoc of postsSnapshot.docs) {
            const commentsQuery = query(
                collection(db, 'posts', postDoc.id, 'comments'),
                orderBy('createdAt', 'desc')
            );
            
            const commentsSnapshot = await getDocs(commentsQuery);
            commentsSnapshot.forEach(commentDoc => {
                allComments.push({
                    id: commentDoc.id,
                    postId: postDoc.id,
                    postTitle: postDoc.data().title,
                    ...commentDoc.data()
                });
            });
        }
        
        // Filter comments
        let filteredComments = allComments;
        if (filter === 'pending') {
            filteredComments = allComments.filter(c => !c.moderated && !c.reviewed);
        } else if (filter === 'reported') {
            filteredComments = allComments.filter(c => c.reported);
        } else if (filter === 'moderated') {
            filteredComments = allComments.filter(c => c.moderated);
        }
        
        // Sort by date (newest first)
        filteredComments.sort((a, b) => {
            const dateA = a.createdAt?.toDate() || new Date(0);
            const dateB = b.createdAt?.toDate() || new Date(0);
            return dateB - dateA;
        });
        
        renderComments(filteredComments);
        
    } catch (error) {
        console.error('Error loading comments:', error);
        commentsList.innerHTML = `
            <div class="text-center py-12 text-gray-500">
                <i class="fas fa-exclamation-triangle text-2xl mb-3"></i>
                <p>Failed to load comments</p>
            </div>
        `;
    }
}

// Render comments for admin
function renderComments(comments) {
    const commentsList = document.getElementById('comments-list');
    
    if (comments.length === 0) {
        commentsList.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-comments text-4xl text-gray-300 mb-4"></i>
                <p class="text-gray-500">No comments found</p>
            </div>
        `;
        return;
    }
    
    commentsList.innerHTML = comments.map(comment => {
        const date = comment.createdAt?.toDate() || new Date();
        const isModerated = comment.moderated || false;
        const isReported = comment.reported || false;
        
        return `
            <div class="bg-white rounded-xl border ${isReported ? 'border-red-200' : 'border-gray-200'} p-6">
                <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div class="flex-1">
                        <div class="flex items-center gap-3 mb-2">
                            <h4 class="font-medium text-gray-900">
                                ${comment.authorName || 'Anonymous'}
                            </h4>
                            ${comment.isAdmin ? `
                                <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded-full">
                                    <i class="fas fa-shield-alt"></i>
                                    Admin
                                </span>
                            ` : ''}
                            ${isModerated ? `
                                <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-800 text-xs rounded-full">
                                    <i class="fas fa-exclamation-triangle"></i>
                                    Moderated
                                </span>
                            ` : ''}
                            ${isReported ? `
                                <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-800 text-xs rounded-full">
                                    <i class="fas fa-flag"></i>
                                    Reported
                                </span>
                            ` : ''}
                        </div>
                        
                        <p class="text-sm text-gray-500 mb-3">
                            On: <span class="font-medium">${comment.postTitle}</span>
                            • ${date.toLocaleString()}
                        </p>
                        
                        <div class="prose prose-sm max-w-none text-gray-700 mb-4">
                            ${isModerated ? `
                                <div class="p-3 bg-red-50 border border-red-200 rounded-lg">
                                    <div class="flex items-center gap-2 text-red-700 mb-2">
                                        <i class="fas fa-exclamation-triangle"></i>
                                        <span class="font-medium">Content Moderated</span>
                                    </div>
                                    <p class="text-sm">${comment.content}</p>
                                </div>
                            ` : comment.content}
                        </div>
                        
                        ${comment.reply ? `
                            <div class="mt-4 pl-4 border-l-2 border-emberflare-500">
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="font-semibold text-emberflare-700">
                                        <i class="fas fa-reply mr-1"></i>
                                        Admin Reply
                                    </span>
                                </div>
                                <p class="text-gray-700">${comment.reply}</p>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="flex flex-col gap-2">
                        <button onclick="replyToComment('${comment.postId}', '${comment.id}')"
                                class="px-3 py-2 bg-emberflare-50 hover:bg-emberflare-100 text-emberflare-700 rounded-lg transition-colors text-sm flex items-center gap-2">
                            <i class="fas fa-reply"></i>
                            Reply
                        </button>
                        ${!comment.reply ? `
                            <button onclick="quickReply('${comment.postId}', '${comment.id}')"
                                    class="px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors text-sm flex items-center gap-2">
                                <i class="fas fa-check"></i>
                                Approve & Reply
                            </button>
                        ` : ''}
                        <button onclick="deleteCommentAsAdmin('${comment.postId}', '${comment.id}')"
                                class="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors text-sm flex items-center gap-2">
                            <i class="fas fa-trash"></i>
                            Delete
                        </button>
                        ${!isModerated ? `
                            <button onclick="moderateComment('${comment.postId}', '${comment.id}')"
                                    class="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors text-sm flex items-center gap-2">
                                <i class="fas fa-gavel"></i>
                                Moderate
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Load categories
async function loadCategories() {
    try {
        const categoriesList = document.getElementById('categories-list');
        const postsSnapshot = await getDocs(collection(db, 'posts'));
        const categories = new Map();
        
        // Count category usage
        postsSnapshot.forEach(doc => {
            const post = doc.data();
            if (post.category) {
                post.category.split(',').forEach(cat => {
                    const trimmedCat = cat.trim();
                    if (trimmedCat) {
                        categories.set(trimmedCat, (categories.get(trimmedCat) || 0) + 1);
                    }
                });
            }
        });
        
        // Convert to array and sort
        const sortedCategories = Array.from(categories.entries())
            .sort((a, b) => b[1] - a[1]);
        
        if (sortedCategories.length === 0) {
            categoriesList.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-tags text-2xl mb-3"></i>
                    <p>No categories yet</p>
                </div>
            `;
            return;
        }
        
        categoriesList.innerHTML = sortedCategories.map(([category, count]) => `
            <div class="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <div class="flex items-center gap-3">
                    <i class="fas fa-tag text-gray-400"></i>
                    <span class="font-medium">${category}</span>
                </div>
                <div class="flex items-center gap-4">
                    <span class="text-sm text-gray-500">${count} posts</span>
                    <div class="flex gap-1">
                        <button onclick="renameCategory('${category}')"
                                class="p-1 hover:bg-gray-100 rounded text-gray-600">
                            <i class="fas fa-edit text-sm"></i>
                        </button>
                        <button onclick="deleteCategory('${category}')"
                                class="p-1 hover:bg-red-100 rounded text-red-600">
                            <i class="fas fa-trash text-sm"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

// Create new post
function createNewPost() {
    editingPostId = null;
    document.getElementById('modal-title').textContent = 'Create New Post';
    document.getElementById('save-post-btn').innerHTML = '<i class="fas fa-save mr-2"></i> Save Post';
    
    // Clear form
    document.getElementById('post-title').value = '';
    document.getElementById('post-excerpt').value = '';
    document.getElementById('post-categories').value = '';
    document.getElementById('post-image-url').value = '';
    document.getElementById('post-read-time').value = '5';
    document.getElementById('post-status').value = 'draft';
    
    // Initialize editor if not already
    if (!postEditor) {
        initPostEditor();
    } else {
        postEditor.root.innerHTML = '';
    }
    
    // Show modal
    document.getElementById('new-post-modal').classList.remove('hidden');
}

// Initialize Quill editor
function initPostEditor() {
    if (!postEditor) {
        postEditor = new Quill('#editor-container', {
            theme: 'snow',
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline', 'strike'],
                    ['blockquote', 'code-block'],
                    [{ 'header': 1 }, { 'header': 2 }],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'script': 'sub'}, { 'script': 'super' }],
                    [{ 'indent': '-1'}, { 'indent': '+1' }],
                    [{ 'direction': 'rtl' }],
                    [{ 'size': ['small', false, 'large', 'huge'] }],
                    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                    [{ 'color': [] }, { 'background': [] }],
                    [{ 'font': [] }],
                    [{ 'align': [] }],
                    ['clean'],
                    ['link', 'image', 'video']
                ]
            }
        });
    }
}

// Save post
async function savePost() {
    const title = document.getElementById('post-title').value.trim();
    const excerpt = document.getElementById('post-excerpt').value.trim();
    const categories = document.getElementById('post-categories').value.trim();
    const imageUrl = document.getElementById('post-image-url').value.trim();
    const readTime = parseInt(document.getElementById('post-read-time').value) || 5;
    const status = document.getElementById('post-status').value;
    const content = postEditor ? postEditor.root.innerHTML : '';
    
    if (!title || !content) {
        showNotification('Title and content are required', 'warning');
        return;
    }
    
    const saveBtn = document.getElementById('save-post-btn');
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Saving...';
    saveBtn.disabled = true;
    
    try {
        const postData = {
            title,
            excerpt: excerpt || null,
            content,
            category: categories || null,
            imageUrl: imageUrl || null,
            readTime,
            published: status === 'published',
            likes: 0,
            commentCount: 0,
            views: 0,
            createdAt: editingPostId ? undefined : serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        if (editingPostId) {
            // Update existing post
            await updateDoc(doc(db, 'posts', editingPostId), postData);
            showNotification('Post updated successfully', 'success');
        } else {
            // Create new post
            await addDoc(collection(db, 'posts'), postData);
            showNotification('Post created successfully', 'success');
        }
        
        closeNewPostModal();
        await loadStats();
        await loadPosts();
        
    } catch (error) {
        console.error('Error saving post:', error);
        showNotification('Failed to save post', 'error');
    } finally {
        saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i> Save Post';
        saveBtn.disabled = false;
    }
}

// Edit post
async function editPost(postId) {
    try {
        const postRef = doc(db, 'posts', postId);
        const postSnap = await getDoc(postRef);
        
        if (postSnap.exists()) {
            const post = postSnap.data();
            editingPostId = postId;
            
            document.getElementById('modal-title').textContent = 'Edit Post';
            document.getElementById('save-post-btn').innerHTML = '<i class="fas fa-save mr-2"></i> Update Post';
            
            // Fill form
            document.getElementById('post-title').value = post.title || '';
            document.getElementById('post-excerpt').value = post.excerpt || '';
            document.getElementById('post-categories').value = post.category || '';
            document.getElementById('post-image-url').value = post.imageUrl || '';
            document.getElementById('post-read-time').value = post.readTime || 5;
            document.getElementById('post-status').value = post.published ? 'published' : 'draft';
            
            // Initialize editor and set content
            if (!postEditor) {
                initPostEditor();
            }
            postEditor.root.innerHTML = post.content || '';
            
            // Show modal
            document.getElementById('new-post-modal').classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error editing post:', error);
        showNotification('Failed to load post', 'error');
    }
}

// Delete post
async function deletePost(postId) {
    if (!confirm('Are you sure you want to delete this post? This will also delete all comments and likes.')) {
        return;
    }
    
    try {
        // Delete all comments first
        const commentsQuery = query(collection(db, 'posts', postId, 'comments'));
        const commentsSnapshot = await getDocs(commentsQuery);
        
        const deletePromises = commentsSnapshot.docs.map(commentDoc => 
            deleteDoc(doc(db, 'posts', postId, 'comments', commentDoc.id))
        );
        
        // Delete all likes
        const likesQuery = query(collection(db, 'posts', postId, 'likes'));
        const likesSnapshot = await getDocs(likesQuery);
        
        likesSnapshot.docs.forEach(likeDoc => {
            deletePromises.push(deleteDoc(doc(db, 'posts', postId, 'likes', likeDoc.id)));
        });
        
        await Promise.all(deletePromises);
        
        // Delete the post
        await deleteDoc(doc(db, 'posts', postId));
        
        showNotification('Post deleted successfully', 'success');
        await loadStats();
        await loadPosts();
        
    } catch (error) {
        console.error('Error deleting post:', error);
        showNotification('Failed to delete post', 'error');
    }
}

// Toggle post publish status
async function togglePostPublish(postId, publish) {
    try {
        await updateDoc(doc(db, 'posts', postId), {
            published: publish,
            updatedAt: serverTimestamp()
        });
        
        showNotification(`Post ${publish ? 'published' : 'unpublished'}`, 'success');
        await loadStats();
        await loadPosts();
        
    } catch (error) {
        console.error('Error toggling publish:', error);
        showNotification('Failed to update post', 'error');
    }
}

// Reply to comment
async function replyToComment(postId, commentId) {
    const reply = prompt('Enter your admin reply:');
    if (!reply) return;
    
    try {
        const commentRef = doc(db, 'posts', postId, 'comments', commentId);
        await updateDoc(commentRef, {
            reply,
            repliedAt: serverTimestamp(),
            moderated: false, // Clear moderation if replying
            reported: false
        });
        
        showNotification('Reply posted', 'success');
        await loadComments(document.getElementById('comment-filter').value);
        
    } catch (error) {
        console.error('Error replying to comment:', error);
        showNotification('Failed to post reply', 'error');
    }
}

// Quick approve and reply
async function quickReply(postId, commentId) {
    const reply = prompt('Enter your approval reply:');
    if (!reply) return;
    
    try {
        const commentRef = doc(db, 'posts', postId, 'comments', commentId);
        await updateDoc(commentRef, {
            reply,
            repliedAt: serverTimestamp(),
            moderated: false,
            reported: false,
            reviewed: true
        });
        
        showNotification('Comment approved and replied', 'success');
        await loadComments(document.getElementById('comment-filter').value);
        
    } catch (error) {
        console.error('Error quick replying:', error);
        showNotification('Failed to approve comment', 'error');
    }
}

// Delete comment as admin
async function deleteCommentAsAdmin(postId, commentId) {
    if (!confirm('Delete this comment as admin?')) return;
    
    try {
        await deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
        
        // Update comment count
        await updateDoc(doc(db, 'posts', postId), {
            commentCount: increment(-1)
        });
        
        showNotification('Comment deleted by admin', 'success');
        await loadComments(document.getElementById('comment-filter').value);
        await loadStats();
        
    } catch (error) {
        console.error('Error deleting comment:', error);
        showNotification('Failed to delete comment', 'error');
    }
}

// Moderate comment
async function moderateComment(postId, commentId) {
    if (!confirm('Mark this comment as moderated? It will be blurred for users.')) return;
    
    try {
        const commentRef = doc(db, 'posts', postId, 'comments', commentId);
        await updateDoc(commentRef, {
            moderated: true,
            moderatedAt: serverTimestamp()
        });
        
        showNotification('Comment moderated', 'success');
        await loadComments(document.getElementById('comment-filter').value);
        
    } catch (error) {
        console.error('Error moderating comment:', error);
        showNotification('Failed to moderate comment', 'error');
    }
}

// Add new category
function addNewCategory() {
    const category = prompt('Enter new category name:');
    if (category) {
        showNotification(`Category "${category}" will be available for future posts`, 'info');
        // In a real implementation, you would add to a categories collection
    }
}

// Rename category
async function renameCategory(oldCategory) {
    const newCategory = prompt('Enter new category name:', oldCategory);
    if (!newCategory || newCategory === oldCategory) return;
    
    if (!confirm(`Rename "${oldCategory}" to "${newCategory}"? This will update all posts with this category.`)) return;
    
    try {
        // Find all posts with this category
        const postsQuery = query(collection(db, 'posts'));
        const snapshot = await getDocs(postsQuery);
        
        const updatePromises = [];
        snapshot.forEach(docSnap => {
            const post = docSnap.data();
            if (post.category && post.category.includes(oldCategory)) {
                const newCategories = post.category.split(',')
                    .map(cat => cat.trim())
                    .map(cat => cat === oldCategory ? newCategory : cat)
                    .join(', ');
                
                updatePromises.push(
                    updateDoc(doc(db, 'posts', docSnap.id), {
                        category: newCategories
                    })
                );
            }
        });
        
        await Promise.all(updatePromises);
        showNotification('Category renamed successfully', 'success');
        await loadCategories();
        await loadPosts();
        
    } catch (error) {
        console.error('Error renaming category:', error);
        showNotification('Failed to rename category', 'error');
    }
}

// Delete category
async function deleteCategory(category) {
    if (!confirm(`Remove category "${category}"? Posts will keep the category but it won't appear in filters.`)) {
        return;
    }
    
    // In a real implementation, you would remove from a categories collection
    // For now, we'll just show a message
    showNotification('Category removed from filters', 'info');
}

// Handle image upload
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showNotification('Image must be less than 5MB', 'error');
        return;
    }
    
    // Check file type
    if (!file.type.startsWith('image/')) {
        showNotification('Please upload an image file', 'error');
        return;
    }
    
    try {
        showNotification('Uploading image...', 'info');
        
        // Create a reference to the file
        const storageRef = ref(storage, `posts/${Date.now()}_${file.name}`);
        
        // Upload the file
        await uploadBytes(storageRef, file);
        
        // Get the download URL
        const downloadURL = await getDownloadURL(storageRef);
        
        // Update the image URL input
        document.getElementById('post-image-url').value = downloadURL;
        
        showNotification('Image uploaded successfully', 'success');
        
    } catch (error) {
        console.error('Error uploading image:', error);
        showNotification('Failed to upload image', 'error');
    } finally {
        // Clear the input
        event.target.value = '';
    }
}

// Admin settings
function openAdminSettings() {
    // Load current settings
    const savedName = localStorage.getItem('admin_display_name') || currentAdmin.displayName || 'Admin';
    const savedModeration = localStorage.getItem('moderation_level') || 'medium';
    
    document.getElementById('admin-display-name').value = savedName;
    document.getElementById('moderation-level').value = savedModeration;
    
    document.getElementById('admin-settings-modal').classList.remove('hidden');
    closeAdminMenu();
}

function closeAdminSettings() {
    document.getElementById('admin-settings-modal').classList.add('hidden');
}

async function saveAdminSettings() {
    const displayName = document.getElementById('admin-display-name').value.trim();
    const moderationLevel = document.getElementById('moderation-level').value;
    
    // Save to localStorage
    localStorage.setItem('admin_display_name', displayName);
    localStorage.setItem('moderation_level', moderationLevel);
    
    // Update Firebase profile
    try {
        await updateProfile(currentAdmin, { displayName });
        document.getElementById('admin-name').textContent = displayName;
    } catch (error) {
        console.error('Error updating profile:', error);
    }
    
    showNotification('Settings saved successfully', 'success');
    closeAdminSettings();
}

function loadAdminSettings() {
    const savedName = localStorage.getItem('admin_display_name');
    if (savedName && currentAdmin) {
        document.getElementById('admin-name').textContent = savedName;
    }
}

// UI control functions
function switchTab(tab) {
    currentTab = tab;
    
    // Update active tab
    document.querySelectorAll('[id$="-tab"]').forEach(tabEl => {
        tabEl.classList.remove('border-emberflare-500', 'text-emberflare-600');
        tabEl.classList.add('text-gray-500');
    });
    
    const activeTab = document.getElementById(`${tab}-tab`);
    activeTab.classList.add('border-emberflare-500', 'text-emberflare-600');
    activeTab.classList.remove('text-gray-500');
    
    // Show active content
    document.querySelectorAll('[id$="-content"]').forEach(content => {
        content.classList.add('hidden');
    });
    document.getElementById(`${tab}-content`).classList.remove('hidden');
    
    // Load data for tab
    switch(tab) {
        case 'posts':
            loadPosts();
            break;
        case 'comments':
            loadComments();
            break;
        case 'categories':
            loadCategories();
            break;
        case 'analytics':
            // Load analytics data
            break;
    }
}

function closeNewPostModal() {
    document.getElementById('new-post-modal').classList.add('hidden');
    editingPostId = null;
}

function uploadImage() {
    document.getElementById('image-upload').click();
}

function toggleAdminMenu() {
    const dropdown = document.getElementById('admin-menu-dropdown');
    dropdown.classList.toggle('hidden');
}

function closeAdminMenu() {
    document.getElementById('admin-menu-dropdown').classList.add('hidden');
}

// Close dropdown when clicking outside
document.addEventListener('click', (event) => {
    const adminMenu = document.getElementById('admin-menu');
    if (!adminMenu.contains(event.target)) {
        closeAdminMenu();
    }
});

// Notification helper
function showNotification(message, type = 'info') {
    new Notify({
        status: type,
        title: type.charAt(0).toUpperCase() + type.slice(1),
        text: message,
        effect: 'slide',
        speed: 300,
        customClass: '',
        customIcon: '',
        showIcon: true,
        showCloseButton: true,
        autoclose: true,
        autotimeout: 3000,
        gap: 20,
        distance: 20,
        type: 'outline',
        position: 'right top'
    });
}

// Make functions available globally
window.switchTab = switchTab;
window.createNewPost = createNewPost;
window.closeNewPostModal = closeNewPostModal;
window.savePost = savePost;
window.editPost = editPost;
window.deletePost = deletePost;
window.togglePostPublish = togglePostPublish;
window.replyToComment = replyToComment;
window.quickReply = quickReply;
window.deleteCommentAsAdmin = deleteCommentAsAdmin;
window.moderateComment = moderateComment;
window.addNewCategory = addNewCategory;
window.renameCategory = renameCategory;
window.deleteCategory = deleteCategory;
window.uploadImage = uploadImage;
window.openAdminSettings = openAdminSettings;
window.closeAdminSettings = closeAdminSettings;
window.saveAdminSettings = saveAdminSettings;
window.toggleAdminMenu = toggleAdminMenu;
window.adminLogout = adminLogout;
