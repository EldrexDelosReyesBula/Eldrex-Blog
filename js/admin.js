// js/admin.js
import { 
    auth, db, analytics, googleProvider,
    signInWithEmailAndPassword, signInWithPopup, signOut, onAuthStateChanged,
    collection, query, where, orderBy, limit, getDocs, getDoc,
    doc, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp,
    runTransaction
} from './firebase-config.js';

class AdminDashboard {
    constructor() {
        this.currentAdmin = null;
        this.currentTab = 'posts';
        this.editingPostId = null;
        this.currentCommentId = null;
        this.currentCommentPostId = null;
        this.isAdmin = false;
        
        this.init();
    }
    
    async init() {
        // Check admin authentication state
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // Check if user is admin
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                const userData = userDoc.data();
                this.isAdmin = userData?.isAdmin || false;
                
                if (this.isAdmin) {
                    this.currentAdmin = user;
                    this.showDashboard();
                    await this.loadStats();
                    await this.loadPosts();
                    document.getElementById('admin-email-display').textContent = user.email;
                } else {
                    this.showLoginScreen();
                    this.showNotification('Access denied. Admin privileges required.', 'error');
                    await signOut(auth);
                }
            } else {
                this.showLoginScreen();
            }
        });
    }
    
    showLoginScreen() {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('admin-dashboard').classList.add('hidden');
    }
    
    showDashboard() {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('admin-dashboard').classList.remove('hidden');
    }
    
    async adminLogin() {
        const email = document.getElementById('admin-email').value;
        const password = document.getElementById('admin-password').value;
        const loginBtn = document.getElementById('login-btn');
        const errorEl = document.getElementById('login-error');
        
        if (!email || !password) {
            this.showNotification('Please enter email and password', 'error');
            return;
        }
        
        try {
            loginBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> Signing In...';
            loginBtn.disabled = true;
            
            await signInWithEmailAndPassword(auth, email, password);
            errorEl.classList.add('hidden');
            
        } catch (error) {
            console.error('Login error:', error);
            errorEl.textContent = this.getAuthErrorMessage(error.code);
            errorEl.classList.remove('hidden');
        } finally {
            loginBtn.innerHTML = '<span class="material-symbols-outlined">login</span> Sign In';
            loginBtn.disabled = false;
        }
    }
    
    async adminLoginWithGoogle() {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (error) {
            console.error('Google login error:', error);
            this.showNotification('Failed to sign in with Google', 'error');
        }
    }
    
    getAuthErrorMessage(code) {
        switch (code) {
            case 'auth/invalid-email': return 'Invalid email address';
            case 'auth/user-disabled': return 'Account disabled';
            case 'auth/user-not-found': return 'Account not found';
            case 'auth/wrong-password': return 'Incorrect password';
            case 'auth/too-many-requests': return 'Too many attempts. Try again later';
            default: return 'Login failed. Please try again.';
        }
    }
    
    async adminLogout() {
        try {
            await signOut(auth);
            this.showLoginScreen();
            this.showNotification('Logged out successfully', 'success');
        } catch (error) {
            console.error('Logout error:', error);
        }
    }
    
    toggleAdminMenu() {
        document.getElementById('admin-menu').classList.toggle('hidden');
    }
    
    switchTab(tab) {
        this.currentTab = tab;
        
        // Update active tab
        document.querySelectorAll('[id$="-tab"]').forEach(tabEl => {
            tabEl.classList.remove('text-emberflare-600', 'dark:text-emberflare-400', 'border-emberflare-500');
            tabEl.classList.add('text-gray-500', 'dark:text-gray-400');
        });
        
        document.getElementById(`${tab}-tab`).classList.add('text-emberflare-600', 'dark:text-emberflare-400', 'border-emberflare-500');
        document.getElementById(`${tab}-tab`).classList.remove('text-gray-500', 'dark:text-gray-400');
        
        // Show active content
        document.querySelectorAll('[id$="-content"]').forEach(content => {
            content.classList.add('hidden');
        });
        document.getElementById(`${tab}-content`).classList.remove('hidden');
        
        // Load data for tab
        if (tab === 'posts') {
            this.loadPosts();
        } else if (tab === 'comments') {
            this.loadComments();
        } else if (tab === 'analytics') {
            this.loadAnalytics();
        }
    }
    
    async loadStats() {
        try {
            // Load posts stats
            const postsQuery = query(collection(db, 'posts'));
            const postsSnapshot = await getDocs(postsQuery);
            
            const totalPosts = postsSnapshot.size;
            const publishedPosts = postsSnapshot.docs.filter(doc => doc.data().published).length;
            const draftPosts = totalPosts - publishedPosts;
            
            // Count comments
            let totalComments = 0;
            for (const postDoc of postsSnapshot.docs) {
                const commentsQuery = query(
                    collection(db, 'posts', postDoc.id, 'comments'),
                    where('visible', '==', true)
                );
                const commentsSnapshot = await getDocs(commentsQuery);
                totalComments += commentsSnapshot.size;
            }
            
            document.getElementById('total-posts').textContent = totalPosts;
            document.getElementById('published-posts').textContent = publishedPosts;
            document.getElementById('draft-posts').textContent = draftPosts;
            document.getElementById('total-comments').textContent = totalComments;
            
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }
    
    async loadPosts() {
        try {
            const filter = document.getElementById('post-filter')?.value || 'all';
            let postsQuery;
            
            if (filter === 'published') {
                postsQuery = query(
                    collection(db, 'posts'),
                    where('published', '==', true),
                    orderBy('createdAt', 'desc')
                );
            } else if (filter === 'drafts') {
                postsQuery = query(
                    collection(db, 'posts'),
                    where('published', '==', false),
                    orderBy('createdAt', 'desc')
                );
            } else {
                postsQuery = query(
                    collection(db, 'posts'),
                    orderBy('createdAt', 'desc')
                );
            }
            
            const snapshot = await getDocs(postsQuery);
            const postsList = document.getElementById('posts-list');
            
            postsList.innerHTML = snapshot.docs.map(doc => {
                const post = doc.data();
                const date = post.createdAt?.toDate() || new Date();
                
                return `
                    <div class="bg-white dark:bg-emberflare-900 rounded-2xl p-6 shadow border border-emberflare-200 dark:border-emberflare-800">
                        <div class="flex justify-between items-start mb-4">
                            <div class="flex-1">
                                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">${this.escapeHtml(post.title)}</h3>
                                <div class="flex items-center gap-3">
                                    <span class="px-2 py-1 text-xs rounded-full ${post.published ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'}">
                                        ${post.published ? 'Published' : 'Draft'}
                                    </span>
                                    <span class="text-sm text-gray-500">
                                        ${date.toLocaleDateString()}
                                    </span>
                                    ${post.category ? `
                                        <span class="text-sm text-emberflare-600 dark:text-emberflare-400">
                                            ${this.escapeHtml(post.category)}
                                        </span>
                                    ` : ''}
                                    <span class="text-sm text-gray-500">
                                        Likes: ${post.likes || 0}
                                    </span>
                                </div>
                            </div>
                            
                            <div class="flex gap-2">
                                <button onclick="admin.editPost('${doc.id}')" 
                                        class="p-2 hover:bg-emberflare-50 dark:hover:bg-emberflare-800 text-emberflare-600 dark:text-emberflare-400 rounded-lg">
                                    <span class="material-symbols-outlined">edit</span>
                                </button>
                                <button onclick="admin.togglePublish('${doc.id}', ${!post.published})"
                                        class="p-2 hover:bg-emberflare-50 dark:hover:bg-emberflare-800 text-emberflare-600 dark:text-emberflare-400 rounded-lg">
                                    <span class="material-symbols-outlined">${post.published ? 'visibility_off' : 'visibility'}</span>
                                </button>
                                <button onclick="admin.deletePost('${doc.id}')" 
                                        class="p-2 hover:bg-red-50 dark:hover:bg-red-900 text-red-600 dark:text-red-400 rounded-lg">
                                    <span class="material-symbols-outlined">delete</span>
                                </button>
                            </div>
                        </div>
                        
                        <p class="text-gray-600 dark:text-emberflare-300 mb-4 line-clamp-2">${this.escapeHtml(post.excerpt || '')}</p>
                    </div>
                `;
            }).join('');
            
            if (snapshot.size === 0) {
                postsList.innerHTML = `
                    <div class="text-center py-12">
                        <span class="material-symbols-outlined text-6xl text-gray-300 dark:text-emberflare-800 mb-4">
                            article
                        </span>
                        <p class="text-gray-500 dark:text-emberflare-400">No posts found</p>
                    </div>
                `;
            }
            
        } catch (error) {
            console.error('Error loading posts:', error);
            this.showNotification('Failed to load posts', 'error');
        }
    }
    
    async loadComments() {
        try {
            const filter = document.getElementById('comment-filter')?.value || 'all';
            const postsSnapshot = await getDocs(collection(db, 'posts'));
            let allComments = [];
            
            for (const postDoc of postsSnapshot.docs) {
                let commentsQuery;
                
                if (filter === 'pending') {
                    commentsQuery = query(
                        collection(db, 'posts', postDoc.id, 'comments'),
                        where('moderated', '==', true),
                        where('visible', '==', true),
                        orderBy('createdAt', 'desc')
                    );
                } else if (filter === 'moderated') {
                    commentsQuery = query(
                        collection(db, 'posts', postDoc.id, 'comments'),
                        where('moderated', '==', true),
                        orderBy('createdAt', 'desc')
                    );
                } else if (filter === 'reported') {
                    commentsQuery = query(
                        collection(db, 'posts', postDoc.id, 'comments'),
                        where('reported', '==', true),
                        orderBy('createdAt', 'desc')
                    );
                } else {
                    commentsQuery = query(
                        collection(db, 'posts', postDoc.id, 'comments'),
                        orderBy('createdAt', 'desc')
                    );
                }
                
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
            
            // Sort by date
            allComments.sort((a, b) => {
                const dateA = a.createdAt?.toDate() || new Date(0);
                const dateB = b.createdAt?.toDate() || new Date(0);
                return dateB - dateA;
            });
            
            const commentsList = document.getElementById('comments-list');
            commentsList.innerHTML = allComments.length > 0 ? 
                allComments.map(comment => {
                    const date = comment.createdAt?.toDate() || new Date();
                    const hasReply = comment.reply && comment.reply.trim().length > 0;
                    
                    return `
                        <div class="bg-white dark:bg-emberflare-900 rounded-2xl p-6 shadow border border-emberflare-200 dark:border-emberflare-800">
                            <div class="flex justify-between items-start mb-4">
                                <div>
                                    <div class="flex items-center gap-2 mb-2">
                                        <span class="font-medium text-gray-900 dark:text-white">${this.escapeHtml(comment.authorName || 'Anonymous')}</span>
                                        ${comment.isAdmin ? `
                                            <img src="/images/admin-badge.png" alt="Admin" class="w-4 h-4">
                                        ` : ''}
                                        ${comment.moderated ? `
                                            <span class="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded-full">
                                                Moderated
                                            </span>
                                        ` : ''}
                                        ${comment.reported ? `
                                            <span class="px-2 py-1 text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded-full">
                                                Reported
                                            </span>
                                        ` : ''}
                                        ${!comment.visible ? `
                                            <span class="px-2 py-1 text-xs bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 rounded-full">
                                                Hidden
                                            </span>
                                        ` : ''}
                                    </div>
                                    <p class="text-sm text-gray-500">
                                        On: ${this.escapeHtml(comment.postTitle)}
                                    </p>
                                    <p class="text-xs text-gray-500 mt-1">
                                        ${date.toLocaleString()}
                                    </p>
                                </div>
                                
                                <div class="flex gap-2">
                                    <button onclick="admin.openCommentModal('${comment.postId}', '${comment.id}')"
                                            class="p-2 hover:bg-emberflare-50 dark:hover:bg-emberflare-800 text-emberflare-600 dark:text-emberflare-400 rounded-lg">
                                        <span class="material-symbols-outlined">edit</span>
                                    </button>
                                    <button onclick="admin.deleteCommentPermanent('${comment.postId}', '${comment.id}')"
                                            class="p-2 hover:bg-red-50 dark:hover:bg-red-900 text-red-600 dark:text-red-400 rounded-lg">
                                        <span class="material-symbols-outlined">delete</span>
                                    </button>
                                </div>
                            </div>
                            
                            ${comment.moderated ? `
                                <div class="blurred relative rounded-lg overflow-hidden mb-4">
                                    <div class="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-sm">
                                        <div class="text-center p-4 bg-white/80 dark:bg-black/80 rounded-lg">
                                            <span class="material-symbols-outlined text-4xl text-emberflare-400 mb-2">
                                                warning
                                            </span>
                                            <p class="text-sm text-gray-600 dark:text-gray-300">Content moderated</p>
                                            ${comment.moderatedReason ? `
                                                <p class="text-xs text-gray-500 mt-1">Reason: ${comment.moderatedReason}</p>
                                            ` : ''}
                                        </div>
                                    </div>
                                </div>
                            ` : `
                                <p class="text-gray-700 dark:text-emberflare-300 whitespace-pre-wrap mb-4">${this.escapeHtml(comment.content)}</p>
                            `}
                            
                            ${hasReply ? `
                                <div class="mt-4 pl-4 border-l-2 border-emberflare-300">
                                    <div class="flex items-center gap-2 mb-2">
                                        <span class="font-medium text-emberflare-700 dark:text-emberflare-300">Admin Reply</span>
                                        <img src="/images/admin-badge.png" alt="Admin" class="w-4 h-4">
                                    </div>
                                    <p class="text-gray-700 dark:text-emberflare-300">${this.escapeHtml(comment.reply)}</p>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('') : 
                `<div class="text-center py-12 text-gray-500">
                    <span class="material-symbols-outlined text-6xl mb-4">
                        forum
                    </span>
                    <p>No comments found</p>
                </div>`;
            
        } catch (error) {
            console.error('Error loading comments:', error);
            this.showNotification('Failed to load comments', 'error');
        }
    }
    
    async loadAnalytics() {
        try {
            // Load top posts by likes
            const postsQuery = query(
                collection(db, 'posts'),
                where('published', '==', true),
                orderBy('likes', 'desc'),
                limit(5)
            );
            
            const snapshot = await getDocs(postsQuery);
            const topPosts = document.getElementById('top-posts');
            
            topPosts.innerHTML = snapshot.docs.map((doc, index) => {
                const post = doc.data();
                return `
                    <div class="flex items-center justify-between p-3 hover:bg-emberflare-50 dark:hover:bg-emberflare-800 rounded-lg">
                        <div class="flex items-center gap-3">
                            <span class="text-lg font-bold text-emberflare-500">${index + 1}</span>
                            <div>
                                <p class="font-medium truncate max-w-[200px]">${this.escapeHtml(post.title)}</p>
                                <p class="text-xs text-gray-500">${post.category || 'Uncategorized'}</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <p class="font-bold">${post.likes || 0}</p>
                            <p class="text-xs text-gray-500">likes</p>
                        </div>
                    </div>
                `;
            }).join('');
            
            // Load recent activity
            const recentActivity = document.getElementById('recent-activity');
            recentActivity.innerHTML = `
                <div class="space-y-3">
                    <div class="flex items-center gap-3 p-3 hover:bg-emberflare-50 dark:hover:bg-emberflare-800 rounded-lg">
                        <span class="material-symbols-outlined text-green-500">check_circle</span>
                        <div>
                            <p class="font-medium">System Online</p>
                            <p class="text-xs text-gray-500">Just now</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3 p-3 hover:bg-emberflare-50 dark:hover:bg-emberflare-800 rounded-lg">
                        <span class="material-symbols-outlined text-emberflare-500">admin_panel_settings</span>
                        <div>
                            <p class="font-medium">Admin logged in</p>
                            <p class="text-xs text-gray-500">${new Date().toLocaleTimeString()}</p>
                        </div>
                    </div>
                </div>
            `;
            
        } catch (error) {
            console.error('Error loading analytics:', error);
        }
    }
    
    createNewPost() {
        this.editingPostId = null;
        document.getElementById('editor-title').textContent = 'Create New Post';
        document.getElementById('post-title').value = '';
        document.getElementById('post-category').value = '';
        document.getElementById('post-image-url').value = '';
        document.getElementById('post-excerpt').value = '';
        document.getElementById('post-content').value = '';
        document.getElementById('post-status').value = 'draft';
        document.getElementById('save-post-btn').textContent = 'Save Post';
        document.getElementById('post-editor-modal').classList.remove('hidden');
        document.getElementById('preview-side').classList.add('hidden');
    }
    
    closePostEditor() {
        document.getElementById('post-editor-modal').classList.add('hidden');
        this.editingPostId = null;
    }
    
    async editPost(postId) {
        try {
            const postRef = doc(db, 'posts', postId);
            const postSnap = await getDoc(postRef);
            
            if (postSnap.exists()) {
                const post = postSnap.data();
                this.editingPostId = postId;
                
                document.getElementById('editor-title').textContent = 'Edit Post';
                document.getElementById('post-title').value = post.title || '';
                document.getElementById('post-category').value = post.category || '';
                document.getElementById('post-image-url').value = post.imageUrl || '';
                document.getElementById('post-excerpt').value = post.excerpt || '';
                document.getElementById('post-content').value = post.content || '';
                document.getElementById('post-status').value = post.published ? 'published' : 'draft';
                document.getElementById('save-post-btn').textContent = 'Update Post';
                
                document.getElementById('post-editor-modal').classList.remove('hidden');
                document.getElementById('preview-side').classList.add('hidden');
            }
        } catch (error) {
            console.error('Error loading post:', error);
            this.showNotification('Failed to load post', 'error');
        }
    }
    
    previewPost() {
        const previewSide = document.getElementById('preview-side');
        const editorSide = document.getElementById('post-editor-modal').querySelector('.flex-1.border-r');
        const previewContent = document.getElementById('post-preview');
        
        const title = document.getElementById('post-title').value;
        const content = document.getElementById('post-content').value;
        
        // Simple markdown to HTML conversion
        let htmlContent = this.escapeHtml(content)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-emberflare-500 hover:underline">$1</a>')
            .replace(/^\> (.*$)/gm, '<blockquote>$1</blockquote>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
        
        previewContent.innerHTML = `
            <h1 class="text-4xl font-bold mb-6">${this.escapeHtml(title)}</h1>
            <div>${htmlContent}</div>
        `;
        
        previewSide.classList.remove('hidden');
        editorSide.classList.add('hidden');
    }
    
    async savePost() {
        const title = document.getElementById('post-title').value.trim();
        const category = document.getElementById('post-category').value.trim();
        const imageUrl = document.getElementById('post-image-url').value.trim();
        const excerpt = document.getElementById('post-excerpt').value.trim();
        const content = document.getElementById('post-content').value.trim();
        const status = document.getElementById('post-status').value;
        
        if (!title) {
            this.showNotification('Title is required', 'error');
            return;
        }
        
        if (!content) {
            this.showNotification('Content is required', 'error');
            return;
        }
        
        try {
            const postData = {
                title,
                category: category || null,
                imageUrl: imageUrl || null,
                excerpt: excerpt || null,
                content,
                published: status === 'published',
                updatedAt: serverTimestamp()
            };
            
            if (this.editingPostId) {
                // Update existing post
                await updateDoc(doc(db, 'posts', this.editingPostId), postData);
                this.showNotification('Post updated successfully', 'success');
            } else {
                // Create new post
                postData.createdAt = serverTimestamp();
                postData.likes = 0;
                postData.views = 0;
                await addDoc(collection(db, 'posts'), postData);
                this.showNotification('Post created successfully', 'success');
            }
            
            this.closePostEditor();
            await this.loadStats();
            await this.loadPosts();
            
        } catch (error) {
            console.error('Error saving post:', error);
            this.showNotification('Failed to save post', 'error');
        }
    }
    
    async togglePublish(postId, publish) {
        try {
            await updateDoc(doc(db, 'posts', postId), {
                published: publish,
                updatedAt: serverTimestamp()
            });
            
            this.showNotification(`Post ${publish ? 'published' : 'unpublished'}`, 'success');
            await this.loadStats();
            await this.loadPosts();
            
        } catch (error) {
            console.error('Error toggling publish:', error);
            this.showNotification('Failed to update post', 'error');
        }
    }
    
    async deletePost(postId) {
        if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
            return;
        }
        
        try {
            // Delete all comments first
            const commentsQuery = query(collection(db, 'posts', postId, 'comments'));
            const commentsSnapshot = await getDocs(commentsQuery);
            
            const deletePromises = commentsSnapshot.docs.map(commentDoc => 
                deleteDoc(doc(db, 'posts', postId, 'comments', commentDoc.id))
            );
            
            await Promise.all(deletePromises);
            
            // Delete the post
            await deleteDoc(doc(db, 'posts', postId));
            
            this.showNotification('Post deleted successfully', 'success');
            await this.loadStats();
            await this.loadPosts();
            
        } catch (error) {
            console.error('Error deleting post:', error);
            this.showNotification('Failed to delete post', 'error');
        }
    }
    
    async openCommentModal(postId, commentId) {
        try {
            this.currentCommentPostId = postId;
            this.currentCommentId = commentId;
            
            const commentRef = doc(db, 'posts', postId, 'comments', commentId);
            const commentSnap = await getDoc(commentRef);
            const postRef = doc(db, 'posts', postId);
            const postSnap = await getDoc(postRef);
            
            if (commentSnap.exists() && postSnap.exists()) {
                const comment = commentSnap.data();
                const post = postSnap.data();
                const date = comment.createdAt?.toDate() || new Date();
                
                document.getElementById('comment-details').innerHTML = `
                    <div class="bg-emberflare-50 dark:bg-emberflare-800 rounded-lg p-4">
                        <div class="flex items-center gap-3 mb-2">
                            <span class="font-medium">${this.escapeHtml(comment.authorName || 'Anonymous')}</span>
                            <span class="text-sm text-gray-500">${date.toLocaleString()}</span>
                        </div>
                        <p class="text-sm text-gray-600 dark:text-emberflare-300 mb-1">On post: <strong>${this.escapeHtml(post.title)}</strong></p>
                        ${comment.userId ? `<p class="text-xs text-gray-500">User ID: ${comment.userId.substring(0, 8)}...</p>` : ''}
                    </div>
                    
                    <div class="border border-emberflare-200 dark:border-emberflare-700 rounded-lg p-4">
                        <p class="whitespace-pre-wrap">${this.escapeHtml(comment.content)}</p>
                    </div>
                    
                    ${comment.moderatedReason ? `
                        <div class="bg-yellow-50 dark:bg-yellow-900/30 rounded-lg p-4">
                            <p class="text-sm text-yellow-800 dark:text-yellow-200">
                                <strong>Moderation Reason:</strong> ${comment.moderatedReason}
                            </p>
                        </div>
                    ` : ''}
                    
                    ${comment.reply ? `
                        <div class="bg-green-50 dark:bg-green-900/30 rounded-lg p-4">
                            <p class="text-sm text-green-800 dark:text-green-200">
                                <strong>Current Reply:</strong> ${this.escapeHtml(comment.reply)}
                            </p>
                        </div>
                    ` : ''}
                `;
                
                document.getElementById('admin-reply').value = comment.reply || '';
                document.getElementById('comment-modal').classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error loading comment:', error);
            this.showNotification('Failed to load comment', 'error');
        }
    }
    
    closeCommentModal() {
        document.getElementById('comment-modal').classList.add('hidden');
        this.currentCommentId = null;
        this.currentCommentPostId = null;
    }
    
    async approveComment() {
        try {
            const reply = document.getElementById('admin-reply').value.trim();
            
            await updateDoc(doc(db, 'posts', this.currentCommentPostId, 'comments', this.currentCommentId), {
                moderated: false,
                moderatedReason: null,
                reply: reply || null,
                repliedAt: reply ? serverTimestamp() : null,
                updatedAt: serverTimestamp()
            });
            
            this.showNotification('Comment approved', 'success');
            this.closeCommentModal();
            await this.loadComments();
            
        } catch (error) {
            console.error('Error approving comment:', error);
            this.showNotification('Failed to approve comment', 'error');
        }
    }
    
    async moderateComment() {
        const reason = prompt('Enter moderation reason:', 'Inappropriate content');
        if (!reason) return;
        
        try {
            await updateDoc(doc(db, 'posts', this.currentCommentPostId, 'comments', this.currentCommentId), {
                moderated: true,
                moderatedReason: reason,
                updatedAt: serverTimestamp()
            });
            
            this.showNotification('Comment moderated', 'success');
            this.closeCommentModal();
            await this.loadComments();
            
        } catch (error) {
            console.error('Error moderating comment:', error);
            this.showNotification('Failed to moderate comment', 'error');
        }
    }
    
    async deleteComment() {
        if (!confirm('Delete this comment?')) return;
        
        try {
            await deleteDoc(doc(db, 'posts', this.currentCommentPostId, 'comments', this.currentCommentId));
            
            this.showNotification('Comment deleted', 'success');
            this.closeCommentModal();
            await this.loadComments();
            await this.loadStats();
            
        } catch (error) {
            console.error('Error deleting comment:', error);
            this.showNotification('Failed to delete comment', 'error');
        }
    }
    
    async deleteCommentPermanent(postId, commentId) {
        if (!confirm('Permanently delete this comment?')) return;
        
        try {
            await deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
            this.showNotification('Comment permanently deleted', 'success');
            await this.loadComments();
            await this.loadStats();
            
        } catch (error) {
            console.error('Error deleting comment:', error);
            this.showNotification('Failed to delete comment', 'error');
        }
    }
    
    filterPosts() {
        this.loadPosts();
    }
    
    filterComments() {
        this.loadComments();
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    showNotification(message, type = 'info') {
        const container = document.getElementById('notification-container');
        const notification = document.createElement('div');
        
        const bgColor = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            warning: 'bg-yellow-500',
            info: 'bg-emberflare-500'
        }[type];
        
        notification.className = `${bgColor} text-white px-6 py-3 rounded-xl shadow-lg animate-slide-up flex items-center justify-between min-w-[300px]`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()" class="ml-4 hover:opacity-80">
                <span class="material-symbols-outlined text-sm">close</span>
            </button>
        `;
        
        container.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('opacity-0', 'translate-x-4');
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }
}

// Initialize admin dashboard
window.admin = new AdminDashboard();

// Global helper functions
window.adminLogin = () => admin.adminLogin();
window.adminLoginWithGoogle = () => admin.adminLoginWithGoogle();
window.adminLogout = () => admin.adminLogout();
window.toggleAdminMenu = () => admin.toggleAdminMenu();
window.switchTab = (tab) => admin.switchTab(tab);
window.createNewPost = () => admin.createNewPost();
window.closePostEditor = () => admin.closePostEditor();
window.previewPost = () => admin.previewPost();
window.savePost = () => admin.savePost();
window.editPost = (postId) => admin.editPost(postId);
window.togglePublish = (postId, publish) => admin.togglePublish(postId, publish);
window.deletePost = (postId) => admin.deletePost(postId);
window.openCommentModal = (postId, commentId) => admin.openCommentModal(postId, commentId);
window.closeCommentModal = () => admin.closeCommentModal();
window.approveComment = () => admin.approveComment();
window.moderateComment = () => admin.moderateComment();
window.deleteComment = () => admin.deleteComment();
window.deleteCommentPermanent = (postId, commentId) => admin.deleteCommentPermanent(postId, commentId);
window.filterPosts = () => admin.filterPosts();
window.filterComments = () => admin.filterComments();
