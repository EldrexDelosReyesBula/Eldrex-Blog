import { initializeFirebase, getFirebase } from './firebase-config.js';

class BlogManager {
    constructor() {
        // Initialize Firebase first
        initializeFirebase();
        const { db, auth, rtdb, analytics } = getFirebase();
        
        this.db = db;
        this.auth = auth;
        this.rtdb = rtdb;
        this.analytics = analytics;
        
        this.currentUser = null;
        this.posts = [];
        this.filteredPosts = [];
        this.categories = new Set(['All Posts']);
        this.years = new Set(['All Years']);
        this.currentPost = null;
        this.currentFilters = {
            category: 'all',
            year: 'all',
            search: ''
        };

        this.init();
    }

    async init() {
        try {
            // Initialize Firebase Analytics
            if (this.analytics) {
                this.analytics.logEvent('blog_loaded');
            }

            // Sign in anonymously for engagement features
            await this.initAnonymousAuth();

            // Load posts
            await this.loadPosts();

            // Setup event listeners
            this.setupEventListeners();

            // Setup intersection observer for lazy loading
            this.setupLazyLoading();

        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Failed to load blog content. Please refresh the page.');
        }
    }

    async initAnonymousAuth() {
        try {
            // Check for existing anonymous user
            await this.auth.signInAnonymously();
            this.currentUser = this.auth.currentUser;

            // Listen for auth state changes
            this.auth.onAuthStateChanged((user) => {
                this.currentUser = user;
                if (user) {
                    this.loadUserPreferences(user.uid);
                }
            });

        } catch (error) {
            console.error('Auth error:', error);
        }
    }

    async loadPosts() {
        try {
            const postsRef = this.db.collection('posts')
                .where('published', '==', true)
                .orderBy('createdAt', 'desc');

            const snapshot = await postsRef.get();

            if (snapshot.empty) {
                this.showNoPosts();
                return;
            }

            this.posts = [];
            snapshot.forEach(doc => {
                const post = {
                    id: doc.id,
                    ...doc.data(),
                    createdAt: doc.data().createdAt?.toDate() || new Date(),
                    updatedAt: doc.data().updatedAt?.toDate() || new Date()
                };
                this.posts.push(post);

                // Extract categories
                if (post.categories && Array.isArray(post.categories)) {
                    post.categories.forEach(cat => this.categories.add(cat));
                }

                // Extract years
                const year = post.createdAt.getFullYear().toString();
                this.years.add(year);
            });

            this.filteredPosts = [...this.posts];
            this.renderCategories();
            this.renderYears();
            this.renderPosts();
            this.attachPostListeners();

        } catch (error) {
            console.error('Error loading posts:', error);
            this.showError('Failed to load posts. Please try again.');
        }
    }

    renderCategories() {
        const categoryList = document.getElementById('category-list');
        if (!categoryList) return;

        let html = '<button class="category-btn active" data-category="all">All Posts</button>';

        this.categories.forEach(category => {
            if (category !== 'All Posts') {
                html += `<button class="category-btn" data-category="${category}">${category}</button>`;
            }
        });

        categoryList.innerHTML = html;
    }

    renderYears() {
        const yearFilter = document.getElementById('year-filter');
        if (!yearFilter) return;

        let html = '<option value="all">All Years</option>';

        Array.from(this.years)
            .sort((a, b) => b - a)
            .forEach(year => {
                if (year !== 'All Years') {
                    html += `<option value="${year}">${year}</option>`;
                }
            });

        yearFilter.innerHTML = html;
    }

    renderPosts() {
        const postsGrid = document.getElementById('posts-grid');
        if (!postsGrid) return;

        if (this.filteredPosts.length === 0) {
            postsGrid.innerHTML = `
                <div class="no-posts">
                    <h3>No posts found</h3>
                    <p>Try changing your search or filters</p>
                </div>
            `;
            return;
        }

        let html = '';
        this.filteredPosts.forEach((post, index) => {
            const category = post.categories?.[0] || 'Uncategorized';
            const date = post.createdAt.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            html += `
                <article class="post-card" data-id="${post.id}" style="animation-delay: ${index * 0.1}s">
                    ${post.imageUrl ? `
                        <div class="post-media-container">
                            <img data-src="${post.imageUrl}" 
                                 alt="${post.title}" 
                                 class="post-media" 
                                 loading="lazy">
                            <div class="post-badge">${category}</div>
                        </div>
                    ` : ''}
                    
                    <div class="post-content">
                        <h2 class="post-title">${this.escapeHtml(post.title)}</h2>
                        <p class="post-excerpt">${post.excerpt || this.truncateText(post.content, 150)}</p>
                        <div class="post-meta">
                            <div class="post-date">
                                <i class="far fa-calendar"></i>
                                ${date}
                            </div>
                            <button class="post-read-btn" data-id="${post.id}">
                                Read <i class="fas fa-arrow-right"></i>
                            </button>
                        </div>
                    </div>
                </article>
            `;
        });

        postsGrid.innerHTML = html;

        // Initialize lazy loading for newly added images
        this.initLazyLoading();
    }

    async loadPostDetail(postId) {
        try {
            const postRef = this.db.collection('posts').doc(postId);
            const doc = await postRef.get();

            if (!doc.exists) {
                throw new Error('Post not found');
            }

            const post = {
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate() || new Date()
            };

            this.currentPost = post;
            this.renderPostDetail(post);
            this.openPostFullscreen();
            this.loadComments(postId);
            this.loadLikes(postId);

        } catch (error) {
            console.error('Error loading post:', error);
            this.showError('Failed to load post. Please try again.');
        }
    }

    renderPostDetail(post) {
        const content = document.getElementById('post-fullscreen-content');
        if (!content) return;

        const date = post.createdAt.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const category = post.categories?.[0] || 'Uncategorized';

        let bodyHtml = post.content || '';

        // Convert Markdown to HTML if needed
        if (post.contentType === 'markdown') {
            bodyHtml = this.markdownToHtml(post.content);
        }

        const html = `
            ${post.imageUrl ? `
                <div class="post-fullscreen-media-container">
                    <img src="${post.imageUrl}" 
                         alt="${post.title}" 
                         class="post-fullscreen-media">
                </div>
            ` : ''}
            
            <h1 class="post-fullscreen-title">${this.escapeHtml(post.title)}</h1>
            
            <div class="post-fullscreen-meta">
                <span><i class="far fa-calendar"></i> ${date}</span>
                <span><i class="fas fa-tag"></i> ${category}</span>
            </div>
            
            <div class="post-fullscreen-body">
                ${bodyHtml}
            </div>
            
            <div class="comments-section">
                <h3 class="comments-title">Comments</h3>
                
                ${this.currentUser ? `
                    <div class="comment-form">
                        <textarea class="comment-input" 
                                  id="comment-input" 
                                  placeholder="Share your thoughts..."></textarea>
                        <button class="comment-submit-btn" id="comment-submit">
                            Post Comment
                        </button>
                    </div>
                ` : '<p>Sign in to leave a comment.</p>'}
                
                <div class="comments-list" id="comments-list">
                    <!-- Comments will be loaded here -->
                </div>
            </div>
            
            <div class="likes-display" id="likes-display">
                <i class="fas fa-heart"></i>
                <span class="like-count" id="like-count">0</span> likes
            </div>
        `;

        content.innerHTML = html;

        // Add comment submit listener
        const submitBtn = document.getElementById('comment-submit');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => this.submitComment(post.id));
        }
    }

    async loadComments(postId) {
        try {
            const commentsRef = this.db.collection('posts').doc(postId).collection('comments')
                .orderBy('createdAt', 'desc');

            const snapshot = await commentsRef.get();
            const commentsList = document.getElementById('comments-list');

            if (!snapshot.empty) {
                let html = '';
                snapshot.forEach(doc => {
                    const comment = doc.data();
                    const date = comment.createdAt?.toDate() || new Date();

                    html += `
                        <div class="comment-item" data-id="${doc.id}">
                            <div class="comment-header">
                                <div class="comment-author">
                                    <span class="comment-author-name">
                                        ${this.escapeHtml(comment.authorName || 'Anonymous')}
                                    </span>
                                    ${comment.isAdmin ? `
                                        <span class="admin-badge">
                                            <i class="fas fa-check-circle"></i>
                                            Admin
                                        </span>
                                    ` : ''}
                                </div>
                                <span class="comment-date">
                                    ${date.toLocaleDateString()}
                                </span>
                            </div>
                            <div class="comment-content">
                                ${this.escapeHtml(comment.content)}
                            </div>
                            ${comment.userId === this.currentUser?.uid ? `
                                <div class="comment-actions">
                                    <button class="delete-btn" data-id="${doc.id}">
                                        <i class="fas fa-trash"></i> Delete
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    `;
                });

                commentsList.innerHTML = html;

                // Add delete listeners
                document.querySelectorAll('.delete-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const commentId = e.currentTarget.dataset.id;
                        this.deleteComment(postId, commentId);
                    });
                });
            }

        } catch (error) {
            console.error('Error loading comments:', error);
        }
    }

    async submitComment(postId) {
        const input = document.getElementById('comment-input');
        const content = input?.value.trim();

        if (!content) {
            this.showToast('Please enter a comment', 'error');
            return;
        }

        if (!this.currentUser) {
            this.showToast('Please sign in to comment', 'error');
            return;
        }

        try {
            // Get username from local storage
            const username = localStorage.getItem('blog_username') || 'Anonymous';

            // Check for restricted usernames
            if (this.isRestrictedUsername(username)) {
                this.showToast('This username is not allowed', 'error');
                return;
            }

            // Content moderation
            if (this.containsSensitiveContent(content)) {
                this.showToast('Comment contains sensitive content', 'error');
                return;
            }

            const comment = {
                content: content,
                authorName: username,
                userId: this.currentUser.uid,
                postId: postId,
                isAdmin: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await this.db.collection('posts').doc(postId).collection('comments').add(comment);

            // Clear input
            input.value = '';

            // Reload comments
            this.loadComments(postId);

            this.showToast('Comment posted successfully', 'success');
            if (this.analytics) {
                this.analytics.logEvent('comment_posted', {
                    post_id: postId
                });
            }

        } catch (error) {
            console.error('Error posting comment:', error);
            this.showToast('Failed to post comment', 'error');
        }
    }

    async deleteComment(postId, commentId) {
        if (!confirm('Are you sure you want to delete this comment?')) {
            return;
        }

        try {
            await this.db.collection('posts').doc(postId).collection('comments').doc(commentId).delete();
            this.loadComments(postId);
            this.showToast('Comment deleted', 'success');

        } catch (error) {
            console.error('Error deleting comment:', error);
            this.showToast('Failed to delete comment', 'error');
        }
    }

    async loadLikes(postId) {
        try {
            const likesRef = this.rtdb.ref(`likes/${postId}`);

            // Get current like count
            const snapshot = await likesRef.once('value');
            const likes = snapshot.val() || {};
            const likeCount = Object.keys(likes).length;

            // Update display
            const likeCountElement = document.getElementById('like-count');
            if (likeCountElement) {
                likeCountElement.textContent = likeCount;
            }

            // Check if current user liked the post
            if (this.currentUser) {
                const userLikeRef = this.rtdb.ref(`likes/${postId}/${this.currentUser.uid}`);
                userLikeRef.on('value', (snap) => {
                    const likeBtn = document.getElementById('like-btn');
                    if (likeBtn) {
                        likeBtn.classList.toggle('liked', snap.exists());
                    }
                });
            }

            // Setup like button listener
            this.setupLikeButton(postId);

        } catch (error) {
            console.error('Error loading likes:', error);
        }
    }

    async toggleLike(postId) {
        if (!this.currentUser) {
            this.showToast('Please sign in to like posts', 'error');
            return;
        }

        try {
            const userLikeRef = this.rtdb.ref(`likes/${postId}/${this.currentUser.uid}`);
            const snapshot = await userLikeRef.once('value');

            if (snapshot.exists()) {
                // Unlike
                await userLikeRef.remove();
                if (this.analytics) {
                    this.analytics.logEvent('post_unliked', {
                        post_id: postId
                    });
                }
            } else {
                // Like
                await userLikeRef.set({
                    timestamp: Date.now(),
                    userId: this.currentUser.uid
                });
                if (this.analytics) {
                    this.analytics.logEvent('post_liked', {
                        post_id: postId
                    });
                }
            }

        } catch (error) {
            console.error('Error toggling like:', error);
            this.showToast('Failed to update like', 'error');
        }
    }

    filterPosts() {
        let filtered = [...this.posts];

        // Apply category filter
        if (this.currentFilters.category !== 'all') {
            filtered = filtered.filter(post =>
                post.categories?.includes(this.currentFilters.category)
            );
        }

        // Apply year filter
        if (this.currentFilters.year !== 'all') {
            filtered = filtered.filter(post =>
                post.createdAt.getFullYear().toString() === this.currentFilters.year
            );
        }

        // Apply search filter
        if (this.currentFilters.search) {
            const searchTerm = this.currentFilters.search.toLowerCase();
            filtered = filtered.filter(post =>
                post.title.toLowerCase().includes(searchTerm) ||
                post.content.toLowerCase().includes(searchTerm) ||
                post.categories?.some(cat => cat.toLowerCase().includes(searchTerm))
            );
        }

        this.filteredPosts = filtered;
        this.renderPosts();
        this.attachPostListeners();
    }

    setupEventListeners() {
        // Category filter
        document.getElementById('category-list')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('category-btn')) {
                document.querySelectorAll('.category-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                e.target.classList.add('active');

                this.currentFilters.category = e.target.dataset.category;
                this.filterPosts();
                if (this.analytics) {
                    this.analytics.logEvent('category_filter', {
                        category: e.target.dataset.category
                    });
                }
            }
        });

        // Year filter
        document.getElementById('year-filter')?.addEventListener('change', (e) => {
            this.currentFilters.year = e.target.value;
            this.filterPosts();
            if (this.analytics) {
                this.analytics.logEvent('year_filter', {
                    year: e.target.value
                });
            }
        });

        // Search
        document.getElementById('search-btn')?.addEventListener('click', () => {
            this.currentFilters.search = document.getElementById('search-input').value;
            this.filterPosts();
            if (this.analytics) {
                this.analytics.logEvent('search', {
                    term: this.currentFilters.search
                });
            }
        });

        document.getElementById('search-input')?.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                this.currentFilters.search = e.target.value;
                this.filterPosts();
                if (this.analytics) {
                    this.analytics.logEvent('search', {
                        term: e.target.value
                    });
                }
            }
        });

        // Clear filters
        document.getElementById('clear-filters')?.addEventListener('click', () => {
            this.currentFilters = {
                category: 'all',
                year: 'all',
                search: ''
            };

            document.querySelectorAll('.category-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.category === 'all');
            });

            document.getElementById('search-input').value = '';
            document.getElementById('year-filter').value = 'all';

            this.filterPosts();
            if (this.analytics) {
                this.analytics.logEvent('clear_filters');
            }
        });

        // Settings panel
        document.getElementById('settings-toggle')?.addEventListener('click', () => {
            this.openSettingsPanel();
        });

        document.getElementById('close-settings')?.addEventListener('click', () => {
            this.closeSettingsPanel();
        });

        // Fullscreen post
        document.getElementById('post-fullscreen-back')?.addEventListener('click', () => {
            this.closePostFullscreen();
        });

        document.getElementById('post-fullscreen-share')?.addEventListener('click', () => {
            this.sharePost();
        });

        // Username settings
        document.getElementById('save-username')?.addEventListener('click', () => {
            this.saveUsername();
        });

        document.getElementById('remove-username')?.addEventListener('click', () => {
            this.removeUsername();
        });

        document.getElementById('clear-data')?.addEventListener('click', () => {
            this.clearLocalData();
        });

        // Legal pages (placeholder)
        ['privacy-policy', 'terms-of-use', 'license'].forEach(id => {
            document.getElementById(id)?.addEventListener('click', () => {
                this.showToast('Legal pages coming soon', 'info');
            });
        });
    }

    attachPostListeners() {
        document.querySelectorAll('.post-read-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const postId = e.currentTarget.dataset.id;
                this.loadPostDetail(postId);
            });
        });

        document.querySelectorAll('.post-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.post-read-btn')) {
                    const postId = card.dataset.id;
                    this.loadPostDetail(postId);
                }
            });
        });
    }

    setupLikeButton(postId) {
        const likeBtn = document.createElement('button');
        likeBtn.id = 'like-btn';
        likeBtn.className = 'like-btn';
        likeBtn.innerHTML = '<i class="fas fa-heart"></i> Like';

        likeBtn.addEventListener('click', () => {
            this.toggleLike(postId);
        });

        const likesDisplay = document.getElementById('likes-display');
        if (likesDisplay) {
            likesDisplay.appendChild(likeBtn);
        }
    }

    openPostFullscreen() {
        document.getElementById('post-fullscreen').classList.add('active');
        document.body.classList.add('no-scroll');

        // Update URL
        if (this.currentPost?.slug) {
            history.pushState({
                postId: this.currentPost.id
            }, '', `/${this.currentPost.slug}`);
        } else if (this.currentPost) {
            history.pushState({
                postId: this.currentPost.id
            }, '', `?post=${this.currentPost.id}`);
        }
    }

    closePostFullscreen() {
        document.getElementById('post-fullscreen').classList.remove('active');
        document.body.classList.remove('no-scroll');
        history.replaceState(null, '', '/');
    }

    openSettingsPanel() {
        document.getElementById('settings-panel').classList.add('active');
        document.body.classList.add('no-scroll');
    }

    closeSettingsPanel() {
        document.getElementById('settings-panel').classList.remove('active');
        document.body.classList.remove('no-scroll');
    }

    saveUsername() {
        const input = document.getElementById('username-input');
        const username = input?.value.trim();

        if (!username) {
            this.showToast('Please enter a username', 'error');
            return;
        }

        if (this.isRestrictedUsername(username)) {
            this.showToast('This username is not allowed', 'error');
            return;
        }

        localStorage.setItem('blog_username', username);
        this.showToast('Username saved', 'success');
        if (this.analytics) {
            this.analytics.logEvent('username_set');
        }
    }

    removeUsername() {
        localStorage.removeItem('blog_username');
        document.getElementById('username-input').value = '';
        this.showToast('Username removed', 'success');
        if (this.analytics) {
            this.analytics.logEvent('username_removed');
        }
    }

    loadUserPreferences(userId) {
        const username = localStorage.getItem('blog_username');
        if (username && document.getElementById('username-input')) {
            document.getElementById('username-input').value = username;
        }
    }

    clearLocalData() {
        if (confirm('Clear all local data (username, preferences)?')) {
            localStorage.clear();
            location.reload();
        }
    }

    async sharePost() {
        if (!this.currentPost) return;

        const shareData = {
            title: this.currentPost.title,
            text: this.currentPost.excerpt || this.truncateText(this.currentPost.content, 100),
            url: window.location.href
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
                if (this.analytics) {
                    this.analytics.logEvent('post_shared', {
                        post_id: this.currentPost.id
                    });
                }
            } catch (error) {
                console.error('Error sharing:', error);
            }
        } else {
            // Fallback: copy to clipboard
            await navigator.clipboard.writeText(shareData.url);
            this.showToast('Link copied to clipboard', 'success');
        }
    }

    // Utility methods
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    truncateText(text, length) {
        if (!text) return '';
        return text.length > length ? text.substring(0, length) + '...' : text;
    }

    markdownToHtml(markdown) {
        // Simple markdown to HTML converter
        return markdown
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
            .replace(/\*(.*)\*/gim, '<em>$1</em>')
            .replace(/!\[(.*?)\]\((.*?)\)/gim, '<img src="$2" alt="$1">')
            .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2">$1</a>')
            .replace(/\n\n/gim, '</p><p>')
            .replace(/\n/gim, '<br>');
    }

    isRestrictedUsername(username) {
        const restricted = [
            'eldrex',
            'delos reyes',
            'bula',
            'admin',
            'administrator',
            'moderator'
        ];

        const lowerUsername = username.toLowerCase();
        return restricted.some(restrictedName =>
            lowerUsername.includes(restrictedName) ||
            restrictedName.includes(lowerUsername)
        );
    }

    containsSensitiveContent(text) {
        // Simple content moderation
        const sensitivePatterns = [
            /\b(hate|violence|attack|kill)\b/i,
            /racial.*slur/i,
            /explicit.*content/i
        ];

        return sensitivePatterns.some(pattern => pattern.test(text));
    }

    setupLazyLoading() {
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.classList.add('loaded');
                    this.observer.unobserve(img);
                }
            });
        }, {
            rootMargin: '50px',
            threshold: 0.1
        });
    }

    initLazyLoading() {
        document.querySelectorAll('img[data-src]').forEach(img => {
            this.observer?.observe(img);
        });
    }

    showError(message) {
        const postsGrid = document.getElementById('posts-grid');
        if (postsGrid) {
            postsGrid.innerHTML = `
                <div class="no-posts">
                    <h3>Error</h3>
                    <p>${message}</p>
                    <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem;">
                        Retry
                    </button>
                </div>
            `;
        }
    }

    showNoPosts() {
        const postsGrid = document.getElementById('posts-grid');
        if (postsGrid) {
            postsGrid.innerHTML = `
                <div class="no-posts">
                    <h3>No posts yet</h3>
                    <p>Check back later for new content.</p>
                </div>
            `;
        }
    }

    showToast(message, type = 'info') {
        // Remove existing toast
        const existingToast = document.querySelector('.toast');
        if (existingToast) existingToast.remove();

        // Create new toast
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            background: ${type === 'error' ? 'var(--emberflare-400)' : 'var(--primary)'};
            color: white;
            border-radius: var(--border-radius-md);
            z-index: 9999;
            animation: slideIn 0.3s ease-out;
        `;

        document.body.appendChild(toast);

        // Auto remove after 3 seconds
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-out forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

export default BlogManager;
